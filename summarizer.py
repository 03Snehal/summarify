"""
Summarify - NLP Summarization Engine
Real extractive (LexRank) + abstractive (T5) summarization pipeline
"""

import re
import math
import string
from collections import Counter

import nltk
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab', quiet=True)

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords', quiet=True)

# ─────────────────────────────────────────────
#  EXTRACTIVE SUMMARIZATION  (LexRank-style)
# ─────────────────────────────────────────────

def preprocess_text(text):
    """Tokenize sentences and clean text."""
    sentences = sent_tokenize(text.strip())
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
    return sentences


def get_stopwords():
    try:
        return set(stopwords.words('english'))
    except Exception:
        return set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
                    'to', 'for', 'of', 'with', 'by', 'is', 'was', 'are', 'were'])


def tfidf_vectorize(sentences):
    """Compute TF-IDF vectors for each sentence."""
    stop_words = get_stopwords()

    def tokenize(sent):
        tokens = word_tokenize(sent.lower())
        return [t for t in tokens if t not in stop_words and t not in string.punctuation and t.isalpha()]

    tokenized = [tokenize(s) for s in sentences]

    # IDF
    N = len(sentences)
    df = Counter()
    for tokens in tokenized:
        for term in set(tokens):
            df[term] += 1

    idf = {term: math.log((N + 1) / (count + 1)) + 1 for term, count in df.items()}

    # TF-IDF
    vectors = []
    for tokens in tokenized:
        tf = Counter(tokens)
        total = len(tokens) if tokens else 1
        vec = {term: (count / total) * idf.get(term, 0) for term, count in tf.items()}
        vectors.append(vec)

    return vectors


def cosine_similarity(v1, v2):
    """Cosine similarity between two sparse TF-IDF vectors."""
    common = set(v1.keys()) & set(v2.keys())
    if not common:
        return 0.0
    dot = sum(v1[k] * v2[k] for k in common)
    mag1 = math.sqrt(sum(x ** 2 for x in v1.values()))
    mag2 = math.sqrt(sum(x ** 2 for x in v2.values()))
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot / (mag1 * mag2)


def build_similarity_matrix(vectors):
    n = len(vectors)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                matrix[i][j] = cosine_similarity(vectors[i], vectors[j])
    return matrix


def lexrank_scores(matrix, damping=0.85, iterations=50):
    """Power-iteration LexRank to score sentences."""
    n = len(matrix)
    if n == 0:
        return []

    # Row-normalize
    norm_matrix = []
    for row in matrix:
        total = sum(row)
        if total > 0:
            norm_matrix.append([v / total for v in row])
        else:
            norm_matrix.append([1.0 / n] * n)

    scores = [1.0 / n] * n
    for _ in range(iterations):
        new_scores = [(1 - damping) / n] * n
        for j in range(n):
            for i in range(n):
                new_scores[j] += damping * scores[i] * norm_matrix[i][j]
        scores = new_scores

    return scores


def extractive_summarize(text, num_sentences=4):
    """
    Real LexRank-based extractive summarization.
    Returns (summary_text, highlighted_html, sentence_scores).
    """
    sentences = preprocess_text(text)
    if not sentences:
        return "", text, []

    if len(sentences) <= num_sentences:
        return ' '.join(sentences), text, list(range(len(sentences)))

    vectors = tfidf_vectorize(sentences)
    sim_matrix = build_similarity_matrix(vectors)
    scores = lexrank_scores(sim_matrix)

    # Rank by score, keep top N in original order
    ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    top_indices = sorted(ranked[:num_sentences])

    summary_sentences = [sentences[i] for i in top_indices]
    summary = ' '.join(summary_sentences)

    # Build highlighted HTML
    highlighted = text
    for idx in top_indices:
        sent = sentences[idx]
        escaped = re.escape(sent)
        highlighted = re.sub(escaped, f'<mark class="highlight">{sent}</mark>', highlighted, count=1)

    return summary, highlighted, top_indices


def get_key_sentences(text, num=5):
    """Return bullet-point key sentences."""
    sentences = preprocess_text(text)
    if not sentences:
        return []
    n = min(num, len(sentences))
    vectors = tfidf_vectorize(sentences)
    if not vectors or all(not v for v in vectors):
        return sentences[:n]
    sim_matrix = build_similarity_matrix(vectors)
    scores = lexrank_scores(sim_matrix)
    ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    top = sorted(ranked[:n])
    return [sentences[i] for i in top]


def get_action_points(text):
    """Extract actionable sentences."""
    action_keywords = ['should', 'must', 'important', 'required', 'need to',
                       'needs to', 'have to', 'recommend', 'ensure', 'critical',
                       'essential', 'necessary', 'advised', 'suggested']
    sentences = preprocess_text(text)
    actions = []
    for s in sentences:
        lower = s.lower()
        if any(kw in lower for kw in action_keywords):
            actions.append(s)
    return actions[:8]  # cap at 8


def get_headline(text):
    """Generate a headline: pick highest-scored short sentence."""
    sentences = preprocess_text(text)
    if not sentences:
        return ""
    # Prefer shorter sentences with high score for headline
    vectors = tfidf_vectorize(sentences)
    sim_matrix = build_similarity_matrix(vectors)
    scores = lexrank_scores(sim_matrix)
    # Penalize very long sentences for headline use
    adjusted = [scores[i] * (1.0 / (1 + len(sentences[i]) / 100)) for i in range(len(sentences))]
    best = max(range(len(adjusted)), key=lambda i: adjusted[i])
    headline = sentences[best]
    # Trim to ~120 chars if too long
    if len(headline) > 120:
        headline = headline[:117] + '...'
    return headline


def get_gist(text):
    """Ultra-short 1-sentence gist."""
    sentences = preprocess_text(text)
    if not sentences:
        return ""
    vectors = tfidf_vectorize(sentences)
    sim_matrix = build_similarity_matrix(vectors)
    scores = lexrank_scores(sim_matrix)
    best = max(range(len(scores)), key=lambda i: scores[i])
    return sentences[best]


# ─────────────────────────────────────────────
#  ABSTRACTIVE SUMMARIZATION  (T5 transformer)
# ─────────────────────────────────────────────

_abstractive_pipeline = None


def load_abstractive_pipeline():
    global _abstractive_pipeline
    if _abstractive_pipeline is None:
        try:
            from transformers import pipeline
            _abstractive_pipeline = pipeline(
                "summarization",
                model="t5-small",
                tokenizer="t5-small",
                framework="pt"
            )
        except Exception as e:
            _abstractive_pipeline = None
            raise RuntimeError(f"Could not load T5 model: {e}")
    return _abstractive_pipeline


def abstractive_summarize(text, length='medium'):
    """
    T5-based abstractive summarization.
    Falls back to extractive if model unavailable.
    """
    length_map = {'short': (30, 60), 'medium': (60, 130), 'long': (100, 200)}
    min_len, max_len = length_map.get(length, (60, 130))

    # T5 works best on ~512 tokens; truncate input if needed
    words = text.split()
    if len(words) > 400:
        text = ' '.join(words[:400])

    try:
        pipe = load_abstractive_pipeline()
        result = pipe(
            text,
            max_length=max_len,
            min_length=min_len,
            do_sample=False,
            truncation=True
        )
        return result[0]['summary_text']
    except Exception:
        # Graceful fallback to extractive
        num = {'short': 2, 'medium': 4, 'long': 6}.get(length, 4)
        summary, _, _ = extractive_summarize(text, num_sentences=num)
        return summary


# ─────────────────────────────────────────────
#  ANALYTICS
# ─────────────────────────────────────────────

def compute_analytics(original_text, summary_text):
    """Return analytics dict."""
    orig_words = len(original_text.split())
    summ_words = len(summary_text.split())
    orig_sents = len(sent_tokenize(original_text)) if original_text else 0
    summ_sents = len(sent_tokenize(summary_text)) if summary_text else 0

    compression = round((1 - summ_words / max(orig_words, 1)) * 100, 1)
    orig_read_time = round(orig_words / 200, 1)   # ~200 wpm
    summ_read_time = round(summ_words / 200, 1)
    time_saved = round(orig_read_time - summ_read_time, 1)

    return {
        'original_words': orig_words,
        'summary_words': summ_words,
        'original_sentences': orig_sents,
        'summary_sentences': summ_sents,
        'compression_ratio': compression,
        'original_read_time': orig_read_time,
        'summary_read_time': summ_read_time,
        'time_saved': max(time_saved, 0)
    }


# ─────────────────────────────────────────────
#  MAIN SUMMARIZE FUNCTION
# ─────────────────────────────────────────────

def summarize(text, method='extractive', length='medium', formats=None):
    """
    Full summarization pipeline.

    Returns dict with all formats + analytics + highlighted text.
    """
    if formats is None:
        formats = ['paragraph', 'bullets', 'headline', 'gist', 'actions', 'highlight']

    num_sentences = {'short': 2, 'medium': 4, 'long': 6}.get(length, 4)

    result = {}

    # --- Extractive core (always computed for bullets/highlight/actions) ---
    ext_summary, highlighted_html, top_indices = extractive_summarize(text, num_sentences=num_sentences)
    key_sentences = get_key_sentences(text, num=num_sentences)
    action_points = get_action_points(text)
    headline = get_headline(text)
    gist = get_gist(text)

    if method == 'abstractive':
        try:
            paragraph = abstractive_summarize(text, length=length)
        except Exception as e:
            paragraph = ext_summary  # fallback
            result['abstractive_error'] = str(e)
    else:
        paragraph = ext_summary

    result['paragraph'] = paragraph
    result['bullets'] = key_sentences
    result['headline'] = headline
    result['gist'] = gist
    result['actions'] = action_points
    result['highlighted'] = highlighted_html
    result['analytics'] = compute_analytics(text, paragraph)
    result['method'] = method
    result['length'] = length

    return result
