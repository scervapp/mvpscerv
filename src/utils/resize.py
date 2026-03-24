import fitz  # PyMuPDF

def resize_pdf_to_4x6(input_pdf, output_pdf):
    src_doc = fitz.open(input_pdf)
    out_doc = fitz.open()  # Create a new empty PDF
    
    # Define the new size: 4x6 inches (1 inch = 72 points)
    new_width = 4 * 72   # 288 points
    new_height = 6 * 72  # 432 points
    new_rect = fitz.Rect(0, 0, new_width, new_height)
    
    for page_index in range(len(src_doc)):
        # Create a blank 4x6 page in the new document
        new_page = out_doc.new_page(width=new_width, height=new_height)
        
        # Stamp the original 5x7 page onto this new 4x6 page
        # This forces the content to scale and fit the new dimensions
        new_page.show_pdf_page(new_rect, src_doc, page_index)
        
    out_doc.save(output_pdf)
    src_doc.close()
    out_doc.close()
    print(f"Success! Resized PDF saved as: {output_pdf}")

# Run the script
INPUT_FILE = "Daquiri23_TableCards2.pdf"
OUTPUT_FILE = "Daquiri23_TableCards_4x62.pdf"

resize_pdf_to_4x6(INPUT_FILE, OUTPUT_FILE)