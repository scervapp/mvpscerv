import fitz  # PyMuPDF

def create_2up_duplex(english_pdf, spanish_pdf, output_pdf):
    en_doc = fitz.open(english_pdf)
    es_doc = fitz.open(spanish_pdf)
    out_doc = fitz.open()

    # Define the new 2-up page dimensions: 8 inches wide by 6 inches tall (1 inch = 72 points)
    width = 8 * 72   # 576 points
    height = 6 * 72  # 432 points
    
    # Define the left and right halves of the sheet
    rect_left = fitz.Rect(0, 0, width / 2, height)
    rect_right = fitz.Rect(width / 2, 0, width, height)

    # Use the length of the documents to know when to stop
    total_pages = min(len(en_doc), len(es_doc))

    for i in range(0, total_pages, 2):
        # ==========================================
        # 1. FRONT SIDE (ENGLISH)
        # ==========================================
        front_page = out_doc.new_page(width=width, height=height)
        
        # English Card 1 goes on the Left
        front_page.show_pdf_page(rect_left, en_doc, i)      
        
        # English Card 2 goes on the Right (if it exists)
        if i + 1 < total_pages:
            front_page.show_pdf_page(rect_right, en_doc, i + 1) 

        # ==========================================
        # 2. BACK SIDE (SPANISH)
        # ==========================================
        back_page = out_doc.new_page(width=width, height=height)
        
        # DUPLEX FLIP: To print back-to-back correctly, the back page is swapped.
        # Spanish Card 2 goes on the Left
        if i + 1 < total_pages:
            back_page.show_pdf_page(rect_left, es_doc, i + 1)   
            
        # Spanish Card 1 goes on the Right
        back_page.show_pdf_page(rect_right, es_doc, i)      

    out_doc.save(output_pdf)
    en_doc.close()
    es_doc.close()
    out_doc.close()
    print(f"Success! 2-up double-sided PDF saved as: {output_pdf}")

# --- Run the Script ---
ENGLISH_FILE = "d23final1.pdf"
SPANISH_FILE = "d23final2.pdf"
OUTPUT_FILE = "Daquiri23_PrintReady_2Up.pdf"

create_2up_duplex(ENGLISH_FILE, SPANISH_FILE, OUTPUT_FILE)