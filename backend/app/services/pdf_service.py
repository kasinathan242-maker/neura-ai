from pypdf import PdfReader
from io import BytesIO

class PDFService:
    def __init__(self):
        self.storage = {}  # In-memory storage for MVP

    def extract_text(self, content: bytes, filename: str) -> str:
        try:
            reader = PdfReader(BytesIO(content))
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            
            self.storage[filename] = text
            return text
        except Exception as e:
            print(f"Error parsing PDF: {e}")
            return ""

    def get_context(self, filename: str) -> str:
        return self.storage.get(filename, "")

pdf_service = PDFService()
