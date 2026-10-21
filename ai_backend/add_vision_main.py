with open('d:\\candidate_followup\\ai_backend\\main.py', 'r', encoding='utf-8') as f:
    text = f.read()

target = '''        extracted_text = parse_file(file_bytes, filename)

        if not extracted_text.strip():

            logger.warning(f"No valid text extracted from {filename} in CV parse")

            raise HTTPException(status_code=400, detail="无法从文件中提取到有效文本")

        logger.info(f"Calling parse_cv for {filename}...")

        results = await parse_cv(extracted_text)'''

replacement = '''        extracted_text = parse_file(file_bytes, filename)
        
        if len(extracted_text.strip()) < 50 and filename.lower().endswith('.pdf'):
            logger.info(f"Text too short in {filename}. Attempting Vision OCR fallback...")
            from file_parser import extract_images_from_pdf
            from services.cv_parser import parse_cv_from_images
            base64_images = extract_images_from_pdf(file_bytes)
            if not base64_images:
                raise HTTPException(status_code=400, detail="PDF没有任何页面，无法解析。")
            results = await parse_cv_from_images(base64_images)
            logger.info(f"Successfully parsed CV from images for file {filename}")
            return {"status": "success", "data": results}

        if not extracted_text.strip():
            logger.warning(f"No valid text extracted from {filename} in CV parse")
            raise HTTPException(status_code=400, detail="无法从文件中提取到有效文本，或者非PDF格式的扫描件不支持。")

        logger.info(f"Calling parse_cv for {filename}...")
        results = await parse_cv(extracted_text)'''

text = text.replace(target, replacement)

with open('d:\\candidate_followup\\ai_backend\\main.py', 'w', encoding='utf-8') as f:
    f.write(text)
