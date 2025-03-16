import fitz  # PyMuPDF
import sys
import pytesseract
from pdf2image import convert_from_path

def extract_text_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""

    for i, page in enumerate(doc):
        page_text = page.get_text("text")

        if not page_text.strip():  # If no text found, use OCR
            images = convert_from_path(pdf_path, first_page=i+1, last_page=i+1)
            for img in images:
                page_text += pytesseract.image_to_string(img)

        print(f"📄 Page {i+1} Text (First 300 chars):\n{page_text[:300]}")
        text += page_text + "\n"

    return text.strip()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("❌ No PDF file provided.")
        sys.exit(1)

    pdf_path = sys.argv[1]
    extracted_text = extract_text_from_pdf(pdf_path)

    if extracted_text:
        print("✅ Extracted Reference Text:\n", extracted_text)
        print(extracted_text)
    else:
        print("❌ No text extracted. PDF might be an image-based scan.")
