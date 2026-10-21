with open('d:\\candidate_followup\\ai_backend\\services\\cv_parser.py', 'r', encoding='utf-8') as f:
    text = f.read()

append_code = '''
async def parse_cv_from_images(base64_images: list[str]) -> dict:
    """
    Parses a CV from a list of base64 images (for scanned PDFs or image uploads) using Claude 3.5 Sonnet's Vision capability.
    """
    ensure_api_key()
    client = get_client()

    try:
        model_name = get_model_for_task("resume_cv")
        logger.info(f"Parsing CV from {len(base64_images)} images using vision model: {model_name}")
        
        # Prepare the message content with images
        content = [
            {"type": "text", "text": "Here are the images of the candidate's resume/CV. Please extract the structured information in English according to the system prompt guidelines:"}
        ]
        for b64 in base64_images:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"}
            })

        response = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": CV_SYSTEM_PROMPT},
                {"role": "user", "content": content}
            ],
            temperature=0.1,
            max_tokens=8000
        )

        resp_text = response.choices[0].message.content

        try:
            return safe_json_parse(resp_text, '{', '}')
        except Exception as parse_err:
            logger.warning(f"Initial safe_json_parse failed for Image CV: {parse_err}. Attempting auto-fix.")
            fix_response = await client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": "Your previous JSON format was invalid. Please output ONLY the repaired valid JSON object, ensuring internal double quotes are escaped. Do not include any other text."},
                    {"role": "user", "content": resp_text}
                ],
                temperature=0.1,
                max_tokens=8000
            )

            fixed_content = fix_response.choices[0].message.content
            return safe_json_parse(fixed_content, '{', '}')

    except Exception as e:
        logger.error(f"Exception in parse_cv_from_images: {str(e)}", exc_info=True)
        raise ValueError(f"图片简历解析失败: {str(e)}")
'''

if 'parse_cv_from_images' not in text:
    with open('d:\\candidate_followup\\ai_backend\\services\\cv_parser.py', 'a', encoding='utf-8') as f:
        f.write('\n' + append_code)
