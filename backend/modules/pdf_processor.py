from pypdf import PdfReader
from io import BytesIO

# In-memory storage for PDF content (Session based for MVP)
# Key: filename, Value: extracted text
pdf_storage = {}

def extract_text_from_pdf(file_content: bytes, filename: str) -> str:
    try:
        reader = PdfReader(BytesIO(file_content))
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        
        # Store for retrieval
        pdf_storage[filename] = text
        return text
    except Exception as e:
        print(f"Error parsing PDF: {e}")
        return ""

def get_pdf_context(filename: str) -> str:
    return pdf_storage.get(filename, "")
