import fitz  # PyMuPDF
import os

def resize_and_add_qrs(input_pdf, qr_folder, output_pdf):
    src_doc = fitz.open(input_pdf)
    out_doc = fitz.open()
    
    # Define 4x6 inches in points (1 inch = 72 points)
    new_width = 4 * 72   # 288 points
    new_height = 6 * 72  # 432 points
    new_rect = fitz.Rect(0, 0, new_width, new_height)
    
    # --- TWEAK THESE FOR THE NEW 4x6 SIZE ---
    QR_SIZE = 90              # Shrunk slightly to fit the smaller page
    DISTANCE_FROM_TOP = 310   # Adjusted up since the page is shorter
    # ----------------------------------------
    
    for page_index in range(len(src_doc)):
        # 1. Create a blank 4x6 page in the new document
        new_page = out_doc.new_page(width=new_width, height=new_height)
        
        # 2. Stamp the original 5x7 design onto it (this auto-scales the art)
        new_page.show_pdf_page(new_rect, src_doc, page_index)
        
        # 3. Find and place the QR code
        table_number = page_index + 1 
        qr_filename = f"Table_{table_number}.png"
        qr_path = os.path.join(qr_folder, qr_filename)
        
        if os.path.exists(qr_path):
            # Calculate horizontal center of the new 4x6 page
            center_x = new_width / 2
            
            x0 = center_x - (QR_SIZE / 2)
            y0 = DISTANCE_FROM_TOP
            x1 = center_x + (QR_SIZE / 2)
            y1 = DISTANCE_FROM_TOP + QR_SIZE
            
            qr_rect = fitz.Rect(x0, y0, x1, y1)
            new_page.insert_image(qr_rect, filename=qr_path)
            print(f"Success: Resized and stamped {qr_filename} on Page {table_number}")
        else:
            print(f"Skipped: {qr_filename} not found in folder.")

    out_doc.save(output_pdf)
    src_doc.close()
    out_doc.close()
    print(f"\nDone! Saved final file as: {output_pdf}")

# --- Run the Script ---
INPUT_FILE = "Daquiri23_TableCards2.pdf"
QR_DIRECTORY = "table_qrcodes"
OUTPUT_FILE = "Daquiri23_TableCards_Final2.pdf"

resize_and_add_qrs(INPUT_FILE, QR_DIRECTORY, OUTPUT_FILE)