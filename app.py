"""
Summarify – Smart AI Text Summarization Tool
Flask backend
"""

import os
import io
import json
import uuid
import traceback

from flask import (Flask, render_template, request, jsonify,
                   send_file, url_for)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10 MB
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ─── helpers ──────────────────────────────────────────────

def extract_text_from_pdf(file_bytes):
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        pages = [page.extract_text() or '' for page in reader.pages]
        return '\n'.join(pages)
    except Exception as e:
        raise ValueError(f"Could not extract PDF text: {e}")


def make_pdf(text_content):
    """Generate a PDF from plain text using reportlab."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=2*cm, rightMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', parent=styles['Title'],
                                     textColor=colors.HexColor('#EC802B'),
                                     fontSize=20, spaceAfter=14)
        body_style = ParagraphStyle('Body', parent=styles['Normal'],
                                    fontSize=11, leading=16, spaceAfter=8)

        story = [
            Paragraph("Summarify – Summary", title_style),
            Spacer(1, 0.3*cm),
            Paragraph(text_content.replace('\n', '<br/>'), body_style)
        ]
        doc.build(story)
        buf.seek(0)
        return buf
    except Exception as e:
        raise RuntimeError(f"PDF generation failed: {e}")


# ─── routes ───────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/info')
def info():
    return render_template('info.html')


@app.route('/applications')
def applications():
    return render_template('applications.html')


@app.route('/summarize', methods=['POST'])
def summarize_route():
    from summarizer import summarize

    try:
        text = ''

        # File upload(s)
        files = request.files.getlist('files')
        for f in files:
            if f and f.filename:
                if f.filename.endswith('.pdf'):
                    text += '\n' + extract_text_from_pdf(f.read())
                elif f.filename.endswith('.txt'):
                    text += '\n' + f.read().decode('utf-8', errors='ignore')
                else:
                    return jsonify({'error': f'Unsupported file type: {f.filename}'}), 400

        # Plain text input
        form_text = request.form.get('text', '').strip()
        if form_text:
            text = form_text + '\n' + text

        text = text.strip()
        if not text:
            return jsonify({'error': 'No text provided. Please paste text or upload a file.'}), 400

        if len(text.split()) < 30:
            return jsonify({'error': 'Text is too short. Please provide at least 30 words.'}), 400

        method = request.form.get('method', 'extractive')   # extractive | abstractive
        length = request.form.get('length', 'medium')       # short | medium | long

        result = summarize(text, method=method, length=length)
        return jsonify({'success': True, **result})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/download/txt', methods=['POST'])
def download_txt():
    content = request.form.get('content', '')
    buf = io.BytesIO(content.encode('utf-8'))
    buf.seek(0)
    return send_file(buf, mimetype='text/plain',
                     as_attachment=True, download_name='summary.txt')


@app.route('/download/pdf', methods=['POST'])
def download_pdf():
    content = request.form.get('content', '')
    try:
        buf = make_pdf(content)
        return send_file(buf, mimetype='application/pdf',
                         as_attachment=True, download_name='summary.pdf')
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
