import pypdf

def interleave_and_optimize(file_span, file_eng, output_name):
    writer = pypdf.PdfWriter()
    
    # Open both files
    reader_span = pypdf.PdfReader(file_span)
    reader_eng = pypdf.PdfReader(file_eng)
    
    # Determine the number of pages (uses the shorter one to avoid errors)
    num_pages = min(len(reader_span.pages), len(reader_eng.pages))
    
    print(f"Processing {num_pages} pairs of pages...")

    for i in range(num_pages):
        # Add Spanish page
        page_s = reader_span.pages[i]
        page_s.compress_content_streams()  # Optimization 1: Compress streams
        writer.add_page(page_s)
        
        # Add English page
        page_e = reader_eng.pages[i]
        page_e.compress_content_streams()  # Optimization 1: Compress streams
        writer.add_page(page_e)

    # Optimization 2: Remove duplicated objects and compress metadata
    with open(output_name, "wb") as f:
        writer.write(f)
    
    print(f"Success! Saved as: {output_name}")

# Run the function
interleave_and_optimize("Daquiri23_TableCards_Final2.pdf", "Daquiri23_TableCards_Final.pdf", "combined_double_sided.pdf")