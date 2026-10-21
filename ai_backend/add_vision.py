import io
import base64
import pdfplumber

def extract_images_from_pdf(file_bytes: bytes) -> list[str]:
    base64_images = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                img = page.to_image(resolution=150)
                img_io = io.BytesIO()
                img.original.save(img_io, format='PNG')
                img_b64 = base64.b64encode(img_io.getvalue()).decode('utf-8')
                base64_images.append(img_b64)
    except Exception as e:
        raise ValueError(f"Failed to extract images from PDF: {str(e)}")
    return base64_images

with open('d:\\candidate_followup\\ai_backend\\file_parser.py', 'r', encoding='utf-8') as f:
    content = f.read()

if 'extract_images_from_pdf' not in content:
    with open('d:\\candidate_followup\\ai_backend\\file_parser.py', 'a', encoding='utf-8') as f:
        f.write('\nimport base64\n')
        f.write('''
def extract_images_from_pdf(file_bytes: bytes) -> list[str]:
    base64_images = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                img = page.to_image(resolution=150)
                img_io = io.BytesIO()
                img.original.save(img_io, format='PNG')
                img_b64 = base64.b64encode(img_io.getvalue()).decode('utf-8')
                base64_images.append(img_b64)
    except Exception as e:
        raise ValueError(f"Failed to extract images from PDF: {str(e)}")
    return base64_images
''')
