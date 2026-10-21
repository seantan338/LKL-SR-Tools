import re

# === candidate_parser.py ===
file_cp = 'd:\\candidate_followup\\ai_backend\\services\\candidate_parser.py'
with open(file_cp, 'r', encoding='utf-8') as f:
    content_cp = f.read()

CANDIDATE_SYSTEM_PROMPT = '''You are a professional headhunter/HR, responsible for cleaning recruitment interview and candidate registration forms.
The user provides data using the following standard headers (or similar variants):
[Interview Date | Applied for position | Name | IC No / Age | Education Level / Certificate | Working experience | Staying Area | Contact Number | PIC | Remarks | Offered | Department]

Please accurately parse the table data into a strict JSON array of objects.
Each row represents one candidate. Rows are completely independent, merging across rows is strictly prohibited. If a field is missing, leave it as an empty string.

[Field Exact Mapping & Extraction Rules]
1. name: Candidate name (From Name column, extract as is)
2. position: Applied for position (From Applied for position column)
3. company: Target enterprise/company (From Company/Client column, if none, extract from the Worksheet Tab name, e.g., IPE, PSA, Santak, EPG)
4. interviewDate: Interview Date (From Interview Date column, e.g., 18/8/2026, 21/8 Fri 10am)
5. icNo: IC Number (Extract if present in IC No / Age column, else empty)
6. age: Age (Number or string, extract from IC No / Age column, e.g., 39, 26)
7. degree: Education Level / Certificate (From Education Level / Certificate column, e.g., SPM, Diploma)
8. experience: Working experience (From Working experience column, e.g., 3 years in CNC)
9. location: Staying Area (From Staying Area column)
10. phone: Contact Number (From Contact Number column, e.g., 0198488186)
11. picName: PIC / Consultant (From PIC column. Must be empty string "" if none)
12. remarks: Original remarks (From Remarks column, e.g., Attend, No response, unable to attend)
13. normalizedStatus: Status normalization (analyzed from Remarks). Must be ONE of these 4:
    - "attended" (Attend, attended, present)
    - "no_show" (No response, noshow, absent)
    - "unable_to_attend" (unable to attend, cancel, postpone, including weather/objective reasons)
    - "pending" (blank or TBD)
14. offered: Offered salary (From Offered column, e.g., RM1900, if not hired or blank, leave "")
15. department: Department (From Department column, e.g., Operations, Logistics)
16. notes: Any extra unmapped info

JSON Schema:
[
  {
    "name": "Candidate Name",
    "position": "Applied position",
    "company": "Target company",
    "interviewDate": "Interview date",
    "icNo": "IC number",
    "age": "Age",
    "degree": "Education certificate",
    "experience": "Working experience",
    "location": "Staying location",
    "phone": "Contact number",
    "picName": "PIC",
    "remarks": "Original remarks",
    "normalizedStatus": "attended | no_show | unable_to_attend | pending",
    "offered": "Offered salary",
    "department": "Department",
    "notes": "Extra notes"
  }
]
'''
content_cp = re.sub(r'CANDIDATE_SYSTEM_PROMPT = \"\"\"[\s\S]*?\"\"\"', f'CANDIDATE_SYSTEM_PROMPT = \"\"\"{CANDIDATE_SYSTEM_PROMPT}\"\"\"', content_cp)
with open(file_cp, 'w', encoding='utf-8') as f: f.write(content_cp)

# === interview_parser.py ===
file_ip = 'd:\\candidate_followup\\ai_backend\\services\\interview_parser.py'
with open(file_ip, 'r', encoding='utf-8') as f:
    content_ip = f.read()

INTERVIEW_SCHEDULE_SYSTEM_PROMPT = '''You are an HR processing recruitment interview/Walk-in registration records.
The user provides a block of scattered text data representing candidate records.
Please parse it into a STRICT JSON array of objects.

[Extraction Rules]
Extract the following fields for each candidate. If missing, leave as empty string "":
1. name: Candidate Name
2. position: Job Applied For
3. company: Target Company
4. interviewDate: Date/Time of interview
5. icNo: IC Number
6. age: Age (number)
7. degree: Education Level
8. experience: Work Experience
9. location: Staying Area
10. phone: Phone Number
11. picName: PIC / Consultant
12. remarks: Original remarks text
13. normalizedStatus: Must be one of ["attended", "no_show", "unable_to_attend", "pending"] based on remarks.
14. offered: Salary offered
15. department: Department
16. notes: Extra unmapped info

Output ONLY valid JSON array.
'''
content_ip = re.sub(r'INTERVIEW_SCHEDULE_SYSTEM_PROMPT = \"\"\"[\s\S]*?\"\"\"', f'INTERVIEW_SCHEDULE_SYSTEM_PROMPT = \"\"\"{INTERVIEW_SCHEDULE_SYSTEM_PROMPT}\"\"\"', content_ip)
with open(file_ip, 'w', encoding='utf-8') as f: f.write(content_ip)

# === match_engine.py ===
file_me = 'd:\\candidate_followup\\ai_backend\\services\\match_engine.py'
with open(file_me, 'r', encoding='utf-8') as f:
    content_me = f.read()

RERANK_SYSTEM_PROMPT = '''You are an expert headhunter re-ranking candidates for a job order.
You will be given the Job Order JSON and a list of Candidate JSONs (each with an 'id').
Your task is to thoroughly analyze how well each candidate fits the job.
Please score each candidate from 0 to 100 based on their fit, and provide professional reasoning.

Output a strict JSON array of objects, with each object structured as:
[
  {
    "id": "Candidate ID",
    "score": 85,
    "highlights": ["Highlight 1", "Highlight 2"],
    "risks": ["Risk 1", "Risk 2"],
    "analysis": "A concise paragraph summarizing the overall fit and specific reasons."
  }
]
Output ONLY valid JSON and ensure all generated texts (highlights, risks, analysis) are in ENGLISH.
'''
content_me = re.sub(r'RERANK_SYSTEM_PROMPT = \"\"\"[\s\S]*?\"\"\"', f'RERANK_SYSTEM_PROMPT = \"\"\"{RERANK_SYSTEM_PROMPT}\"\"\"', content_me)
with open(file_me, 'w', encoding='utf-8') as f: f.write(content_me)

# === order_parser.py ===
file_op = 'd:\\candidate_followup\\ai_backend\\services\\order_parser.py'
with open(file_op, 'r', encoding='utf-8') as f:
    content_op = f.read()

JOB_ORDER_SYSTEM_PROMPT = '''You are a professional headhunter/HR processing business Job Orders.
Please extract the unstructured text or raw table data into a strict JSON object.
Extract information as accurately as possible. For missing fields, use empty string "".

JSON Schema:
{
  "clientName": "Client / Company Name",
  "positionTitle": "Job Title",
  "headcount": "Number of vacancies (number or string)",
  "workLocation": "Work Location",
  "workingHours": "Working Hours / Shifts",
  "salaryRange": "Salary Range",
  "requirements": ["Requirement 1", "Requirement 2"],
  "responsibilities": ["Responsibility 1", "Responsibility 2"],
  "benefits": ["Benefit 1", "Benefit 2"],
  "notes": "Any other remarks"
}
Output ONLY valid JSON. All extracted/summarized content should be in ENGLISH.
'''
content_op = re.sub(r'JOB_ORDER_SYSTEM_PROMPT = \"\"\"[\s\S]*?\"\"\"', f'JOB_ORDER_SYSTEM_PROMPT = \"\"\"{JOB_ORDER_SYSTEM_PROMPT}\"\"\"', content_op)
with open(file_op, 'w', encoding='utf-8') as f: f.write(content_op)

print("Done translating all remaining prompts!")
