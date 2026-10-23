/**
 * AI Service for CV Generation
 */

class AIService {
  constructor(provider, apiKey) {
    this.provider = provider;
    this.apiKey = apiKey;
    
    if (provider === 'gemini') {
      this.adapter = new GeminiAdapter(apiKey);
    } else if (provider === 'openai') {
      this.adapter = new OpenAIAdapter(apiKey);
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  async extractResumeData(rawText) {
    return await this.adapter.extractResumeData(rawText);
  }

  async parseSheetDataBatch(serializedData, targetType) {
    return await this.adapter.parseSheetDataBatch(serializedData, targetType);
  }
}

class GeminiAdapter {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  }

  async extractResumeData(rawText) {
    const prompt = `
Please extract the following information from the provided resume text and format it as a strictly valid JSON object. 
Ensure the keys match exactly. For missing fields, use empty string or empty array.

JSON Schema:
{
  "name": "Candidate Full Name",
  "email": "Email Address",
  "phone": "Phone Number",
  "summary": "A professional summary or objective (2-3 sentences max)",
  "skills": ["Skill 1", "Skill 2", ...],
  "education": [
    {
      "school": "University Name",
      "degree": "Degree and Major",
      "year": "Graduation Year (e.g. 2024)"
    }
  ],
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "duration": "Start - End Date",
      "description": "Brief description of responsibilities and achievements"
    }
  ]
}

Resume Text:
${rawText.substring(0, 8000)} // Truncate if too long
`;

    const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.2,
          // We want JSON, some newer models support responseMimeType, but we'll parse it manually to be safe
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return this._parseJSONResponse(textOutput);
  }

  _parseJSONResponse(text) {
    try {
      // Find JSON block within markdown or plain text
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        return JSON.parse(jsonStr);
      }
      throw new Error("No JSON object found in response");
    } catch (e) {
      console.error("Failed to parse AI response as JSON", text);
      throw new Error("AI 返回的数据格式无法解析，请重试 / Failed to parse AI response format, please retry.");
    }
  }

  _parseJSONArrayResponse(text) {
    try {
      const jsonStart = text.indexOf('[');
      const jsonEnd = text.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        return JSON.parse(jsonStr);
      }
      throw new Error("No JSON array found in response");
    } catch (e) {
      console.error("Failed to parse AI response as JSON Array", text);
      throw new Error("AI 返回的数据格式无法解析，请重试 / Failed to parse AI response format, please retry.");
    }
  }

  _getBatchPrompt(serializedData, targetType) {
    if (targetType === 'candidate') {
      return `Please parse the following tabular candidate records into a strictly valid JSON array of objects. Extract and normalize the fields. If missing, use empty string.

JSON Schema:
[
  {
    "name": "Candidate Full Name",
    "phone": "Normalized Phone Number (digits only)",
    "email": "Email Address",
    "school": "University Name",
    "major": "Major",
    "degree": "Degree (e.g., 本科, 硕士, 博士, 大专)",
    "company": "Current or Last Company",
    "position": "Job Title",
    "stage": "Infer recruitment stage (screening, phone, interview, offer, pre_onboarding)",
    "interviewDate": "YYYY-MM-DD if mentioned",
    "picName": "Person In Charge / Assigned Recruiter Name (if mentioned)",
    "tags": ["Tag1", "Tag2"],
    "notes": "Brief summary or remarks"
  }
]

Data to Parse:
${serializedData}
`;
    } else {
      return `Please parse the following tabular job order records into a strictly valid JSON array of objects. Extract and normalize the fields. If missing, use empty string.

JSON Schema:
[
  {
    "company": "Company or Client Name",
    "position": "Job Title",
    "location": "Work Location",
    "salary": "Salary Range",
    "workHours": "Working Hours",
    "requirements": "Job Requirements summary",
    "benefits": "Benefits summary",
    "picName": "Person In Charge / Assigned Recruiter Name (if mentioned)",
    "notes": "Additional remarks"
  }
]

Data to Parse:
${serializedData}
`;
    }
  }

  async parseSheetDataBatch(serializedData, targetType) {
    const prompt = this._getBatchPrompt(serializedData, targetType);

    const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this._parseJSONArrayResponse(textOutput);
  }
}

class OpenAIAdapter {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
  }

  async extractResumeData(rawText) {
    const prompt = `
Please extract the following information from the provided resume text and format it as a strictly valid JSON object. 
Ensure the keys match exactly. For missing fields, use empty string or empty array.

JSON Schema:
{
  "name": "Candidate Full Name",
  "email": "Email Address",
  "phone": "Phone Number",
  "summary": "A professional summary or objective (2-3 sentences max)",
  "skills": ["Skill 1", "Skill 2", ...],
  "education": [
    {
      "school": "University Name",
      "degree": "Degree and Major",
      "year": "Graduation Year (e.g. 2024)"
    }
  ],
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "duration": "Start - End Date",
      "description": "Brief description of responsibilities and achievements"
    }
  ]
}

Resume Text:
${rawText.substring(0, 8000)}
`;

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const textOutput = data.choices?.[0]?.message?.content || '';
    
    return JSON.parse(textOutput);
  }

  async parseSheetDataBatch(serializedData, targetType) {
    // We can reuse the prompt generator from GeminiAdapter for simplicity
    // by instantiating it temporarily or duplicating, but duplicating is safer here.
    const getBatchPrompt = (dataStr, type) => {
      if (type === 'candidate') {
        return `Please parse the following tabular candidate records into a strictly valid JSON array of objects.\nJSON Schema:\n[\n  {\n    "name": "Candidate Full Name",\n    "phone": "Phone",\n    "email": "Email",\n    "school": "School",\n    "major": "Major",\n    "degree": "Degree",\n    "company": "Company",\n    "position": "Job Title",\n    "stage": "stage",\n    "interviewDate": "YYYY-MM-DD",\n    "picName": "Person In Charge Name",\n    "tags": ["Tag1"],\n    "notes": "Remarks"\n  }\n]\n\nData:\n${dataStr}`;
      } else {
        return `Please parse the following tabular job order records into a strictly valid JSON array of objects.\nJSON Schema:\n[\n  {\n    "company": "Company",\n    "position": "Job Title",\n    "location": "Location",\n    "salary": "Salary",\n    "workHours": "Hours",\n    "requirements": "Reqs",\n    "benefits": "Benefits",\n    "picName": "Person In Charge Name",\n    "notes": "Remarks"\n  }\n]\n\nData:\n${dataStr}`;
      }
    };

    const prompt = getBatchPrompt(serializedData, targetType);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const textOutput = data.choices?.[0]?.message?.content || '';
    
    try {
      const jsonStart = textOutput.indexOf('[');
      const jsonEnd = textOutput.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return JSON.parse(textOutput.substring(jsonStart, jsonEnd + 1));
      }
      return JSON.parse(textOutput);
    } catch (e) {
      throw new Error("AI 返回的数据格式无法解析，请重试 / Failed to parse AI response format, please retry.");
    }
  }
}

export { AIService };
