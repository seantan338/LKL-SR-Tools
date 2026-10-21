from .core_llm import get_client, ensure_api_key, safe_json_parse, AI_MODEL_NAME, get_model_for_task, logger


CV_SYSTEM_PROMPT = """You are a professional headhunter and senior recruitment consultant.
Your task is to extract the structured profile information of a candidate from the provided CV/Resume text.
To prevent hallucination, please strictly follow these principles:
1. Only extract information that actually exists in the CV text.
2. SENTINEL TOKEN FOR MISSING / UNSTATED INFORMATION:
   If a text field (such as reason for leaving, address, marital status, last drawn salary, expected salary, availability/notice period) is NOT explicitly mentioned or cannot be confirmed from the CV text, you MUST output "[Not Specified]".
   Do NOT guess, fabricate, or assume values.
   For array fields (such as responsibilities, skills, languages), if not mentioned, output an empty array [].
   For age, output null if not explicitly stated.

LANGUAGE RULES:
- The CV may be written in English, Chinese (中文), Bahasa Melayu, or a mix of these. Read it in its original language.
- Output everything in English, with these exceptions: keep company names, school names, and personal names exactly as written in the CV (do not translate or romanize them). If a Chinese name has an English name in the CV, output both, e.g. "Tan Wei Ming (陈伟明)".
- Translate responsibilities and reasons for leaving into natural, professional business English. Translate each employer's content separately; never combine content from different employers into one sentence.

PROFESSIONAL HISTORY RULES (CRITICAL):
1. Every distinct employment record MUST be its own object in the "professional_history" array. NEVER merge two employers, two job titles, or two time periods into one object.
2. If the candidate held several positions at the SAME company (e.g., promotion), output a separate object for each position, with the same company name and its own period.
3. STRICT RESPONSIBILITY ISOLATION & SEMANTIC RELEVANCE:
   - Each "responsibilities" list may ONLY contain duties that genuinely belong to THAT specific position.
   - ALWAYS verify the semantic relevance of a duty against the Job Title and Company. NEVER assign duties to an unrelated job role (e.g., teaching or checking homework belongs to a "Tuition Teacher", NEVER to a "Business Admin" at a telecommunications company).
   - If duty descriptions are separated by empty lines or located ambiguously in unstructured text, assign them to the position they semantically describe. NEVER blindly dump them into whatever company happens to be nearest on the page.
4. EMPTY RESPONSIBILITIES MUST REMAIN EMPTY:
   - If a specific job does not list responsibilities in the CV, its "responsibilities" MUST be an empty array []. NEVER fabricate, borrow, or shift responsibilities from other jobs or floating text to artificially fill an empty job.
5. Before writing the JSON, silently list every employer/period found in the CV, then make sure the length of "professional_history" equals that count.
6. MANDATORY REVERSE CHRONOLOGICAL ORDER:
   - The "professional_history" array MUST strictly be ordered in REVERSE CHRONOLOGICAL ORDER (most recent / current job FIRST at index 0, oldest job LAST).
   - Even if the input CV text lists older jobs first (e.g. 2018 before 2025), you MUST re-sort them so that the latest job (e.g. 2025 - 2026) appears at the very top.
7. Fields not stated for a specific job (salary, reason_for_leaving) MUST be output as "[Not Specified]". Do not copy values from another job.

EDUCATION RULES (CRITICAL):
1. For each education record:
   - "qualification": Full authentic qualification name. PRESERVE the candidate's exact wording when stated in English (e.g., "Bachelor of Business Administration (Honours)", "Diploma in Business", "Master of Business Administration", "SPM"). DO NOT strip "(Honours)" or standard academic prepositions like "of" or "in", and DO NOT transform natural academic phrasing into clumsy forms like "Bachelor Degree Business". If the input is in Chinese, translate to proper academic English (e.g. "Bachelor of Business Administration").
   - "degree": Standardized educational level for database filtering (e.g., "Bachelor Degree", "Diploma", "Master Degree", "SPM", "Certificate").
   - "major": Field of study / Major (e.g., "Business Administration", "Accounting", "Computer Science", null if general or SPM).
2. ORDER: The "education" array MUST strictly be in REVERSE CHRONOLOGICAL ORDER (highest / most recent qualification first).

Please output a single JSON object conforming to the following strict JSON structure. This structure maps to the "Sunrise CV" standard template:
{
  "parsed_cv": {
    "position_applied": "Position applied for (null if not mentioned)",
    "personal_information": {
      "name": "Full Name",
      "phone": "Phone / Mobile / WhatsApp contact number (null if not mentioned)",
      "email": "Email address (null if not mentioned)",
      "address": "Address / Place of residence",
      "age": "Age (number). Only if explicitly stated or a birth date is given, otherwise null",
      "nationality": "Nationality",
      "race": "Race",
      "gender": "Gender",
      "marital_status": "Marital status",
      "last_drawn_salary": "Last drawn salary (null if none)",
      "expected_salary": "Expected salary (null if none)",
      "availability": "Availability / Notice period (e.g., 1 month notice)"
    },
    "professional_history": [
      {
        "period": "Employment period (e.g., 2021 - 2024)",
        "company": "Company Name",
        "position": "Job Title",
        "last_drawn_salary": "Salary for this period (null if not mentioned)",
        "reason_for_leaving": "Reason for leaving (must be null if not mentioned)",
        "responsibilities": ["Responsibility 1", "Responsibility 2 (must be empty [] if not mentioned in CV)"]
      }
    ],
    "education": [
      {
        "year": "Year (e.g., 2023 - 2026)",
        "school": "School Name",
        "qualification": "Full authentic qualification name with honors/field (e.g., Bachelor of Business Administration (Honours), Diploma in Business, SPM)",
        "degree": "Standardized degree level (e.g., Bachelor Degree, Diploma, Master, SPM, etc.)",
        "major": "Field of study / Major (e.g., Business Administration, IT, Accounting, null if general)"
      }
    ],
    "total_years_experience": "Total work experience: use the figure stated in the CV; if not stated, calculate only from the periods in professional_history; null if fresh graduate or if periods are unclear",
    "skills": ["Skill 1", "Skill 2"],
    "languages": ["Language 1", "Language 2"]
  },
  "missing_analysis": {
    "missing_critical_fields": ["List the paths of important fields in parsed_cv that are null, e.g., 'personal_information.expected_salary'"],
    "suggested_questions_for_hr": ["Generate 3-5 professional and polite follow-up questions IN ENGLISH for the HR to directly ask the candidate regarding these missing critical details."]
  }
}

Note:
Think briefly first, and then you must wrap the output result in a ```json code block. Output all content (including HR questions) IN ENGLISH, except the names that must stay as written (see LANGUAGE RULES).
"""


def _extract_latest_year(period: str) -> int:
    """Extracts the latest year from an employment period string for reverse chronological sorting."""
    import re
    if not period or not isinstance(period, str):
        return 0
    p_lower = period.lower()
    if any(k in p_lower for k in ("present", "current", "now", "至今", "目前")):
        return 9999
    years = [int(y) for y in re.findall(r"\b(19\d\d|20\d\d)\b", period)]
    return max(years) if years else 0


def _normalize(result: dict) -> dict:
    """Lightweight sanity check on the model output so the frontend always receives a clean, sorted list."""
    if not isinstance(result, dict):
        return result
    cv = result.get("parsed_cv")
    if not isinstance(cv, dict):
        return result
    hist = cv.get("professional_history") or []
    if isinstance(hist, dict):  # model occasionally returns a single object instead of an array
        hist = [hist]
    elif not isinstance(hist, list):
        hist = []
    
    # Ensure all jobs have normalized responsibilities list
    for job in hist:
        if isinstance(job, dict):
            resps = job.get("responsibilities")
            if resps is None:
                job["responsibilities"] = []
            elif isinstance(resps, str):
                job["responsibilities"] = [r.strip() for r in resps.split("\n") if r.strip()]
            elif not isinstance(resps, list):
                job["responsibilities"] = [str(resps)]

    # Guarantee reverse chronological order (most recent job first)
    if len(hist) > 1:
        job_years = [_extract_latest_year(job.get("period", "")) for job in hist if isinstance(job, dict)]
        if any(job_years) and job_years != sorted(job_years, reverse=True):
            logger.info("Sorting professional_history into strict reverse chronological order")
            hist.sort(key=lambda j: _extract_latest_year(j.get("period", "")) if isinstance(j, dict) else 0, reverse=True)

    cv["professional_history"] = hist
    logger.info(f"CV parsed: professional_history has {len(hist)} record(s)")

    # Ensure education records have authentic and well-formed qualification
    edu_list = cv.get("education") or []
    if isinstance(edu_list, dict):
        edu_list = [edu_list]
    elif not isinstance(edu_list, list):
        edu_list = []

    for edu in edu_list:
        if isinstance(edu, dict):
            qual = str(edu.get("qualification") or "").strip()
            deg = str(edu.get("degree") or "").strip()
            maj = str(edu.get("major") or "").strip()
            if not qual and (deg or maj):
                if deg and maj:
                    d_lower = deg.lower()
                    if "bachelor" in d_lower and "of" not in d_lower:
                        edu["qualification"] = f"Bachelor of {maj}"
                    elif "diploma" in d_lower and "in" not in d_lower:
                        edu["qualification"] = f"Diploma in {maj}"
                    elif "master" in d_lower and "of" not in d_lower:
                        edu["qualification"] = f"Master of {maj}"
                    else:
                        edu["qualification"] = f"{deg} in {maj}"
                else:
                    edu["qualification"] = deg or maj or ""
            elif qual:
                edu["qualification"] = qual

    cv["education"] = edu_list
    return result


async def parse_cv(cv_text: str) -> dict:
    """
    Parses full resume / CV text into structured candidate profile data.
    Designed for upcoming automated CV import & auto-fill features.
    """
    ensure_api_key()
    client = get_client()

    try:
        model_name = get_model_for_task("resume_cv")
        logger.info(f"Parsing CV using model: {model_name}")
        response = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": CV_SYSTEM_PROMPT},
                {"role": "user", "content": f"Here is the candidate's full resume content:\n\n{cv_text}\n\nPlease extract the structured information in English:"}
            ],
            temperature=0.1,
            max_tokens=8000
        )

        content = response.choices[0].message.content

        try:
            return _normalize(safe_json_parse(content, '{', '}'))
        except Exception as parse_err:
            logger.warning(f"Initial safe_json_parse failed for CV: {parse_err}. Attempting auto-fix. Raw response:\n{content}")
            fix_response = await client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": "Your previous JSON format was invalid. Please output ONLY the repaired valid JSON object, ensuring internal double quotes are escaped. Do not include any other text."},
                    {"role": "user", "content": content}
                ],
                temperature=0.1,
                max_tokens=8000
            )

            fixed_content = fix_response.choices[0].message.content
            return _normalize(safe_json_parse(fixed_content, '{', '}'))

    except Exception as e:
        logger.error(f"Exception in parse_cv: {str(e)}", exc_info=True)
        raise ValueError(f"简历解析失败: {str(e)}")


async def parse_cv_from_images(base64_images: list[str]) -> dict:
    """
    Parses a CV from a list of base64 images (for scanned PDFs or image uploads)
    using the vision-capable model configured for the "resume_cv" task.
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
            return _normalize(safe_json_parse(resp_text, '{', '}'))
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
            return _normalize(safe_json_parse(fixed_content, '{', '}'))

    except Exception as e:
        logger.error(f"Exception in parse_cv_from_images: {str(e)}", exc_info=True)
        raise ValueError(f"图片简历解析失败: {str(e)}")
