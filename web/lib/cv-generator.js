/**
 * CV Generator for rendering AI structured data into company template
 * and exporting to PDF / Word.
 */

import html2pdf from 'html2pdf.js';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

export const CVGenerator = {
  /**
   * Render HTML preview of the CV
   * @param {Object} data - Structured candidate data
   * @param {HTMLElement} container - DOM element to render into
   */
  renderCVPreview(data, container) {
    // This is a basic hardcoded template. Later this can be extended to use a real template engine or custom UI.
    const html = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px;">
          <div>
            <h1 style="margin: 0; color: #1e3a8a; font-size: 2.5rem;">${data.name || 'Candidate Name'}</h1>
            <p style="margin: 5px 0 0; color: #6b7280; font-size: 1rem;">
              ${data.email ? data.email + ' | ' : ''}
              ${data.phone ? data.phone : ''}
            </p>
          </div>
          <!-- Placeholder for Company Logo -->
          <div style="text-align: right;">
            <div style="width: 120px; height: 40px; background: #f3f4f6; color: #9ca3af; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">COMPANY LOGO</div>
          </div>
        </div>

        ${data.summary ? `
          <div style="margin-bottom: 25px;">
            <h2 style="color: #2563eb; font-size: 1.25rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px;">Professional Summary</h2>
            <p style="margin: 0;">${data.summary}</p>
          </div>
        ` : ''}

        ${data.education && data.education.length > 0 ? `
          <div style="margin-bottom: 25px;">
            <h2 style="color: #2563eb; font-size: 1.25rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px;">Education</h2>
            ${data.education.map(edu => `
              <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between;">
                  <strong style="color: #1f2937;">${edu.school || 'School'}</strong>
                  <span style="color: #6b7280; font-size: 0.9rem;">${edu.year || ''}</span>
                </div>
                <div style="color: #4b5563;">${edu.degree || 'Degree'}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${data.experience && data.experience.length > 0 ? `
          <div style="margin-bottom: 25px;">
            <h2 style="color: #2563eb; font-size: 1.25rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px;">Professional Experience</h2>
            ${data.experience.map(exp => `
              <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between;">
                  <strong style="color: #1f2937; font-size: 1.1rem;">${exp.title || 'Job Title'}</strong>
                  <span style="color: #6b7280; font-size: 0.9rem; font-weight: 500;">${exp.duration || ''}</span>
                </div>
                <div style="color: #2563eb; margin-bottom: 5px; font-weight: 500;">${exp.company || 'Company Name'}</div>
                <p style="margin: 0; color: #4b5563; font-size: 0.95rem; white-space: pre-wrap;">${exp.description || ''}</p>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${data.skills && data.skills.length > 0 ? `
          <div style="margin-bottom: 25px;">
            <h2 style="color: #2563eb; font-size: 1.25rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px;">Skills</h2>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${data.skills.map(skill => `
                <span style="background: #eff6ff; color: #1d4ed8; padding: 4px 10px; border-radius: 4px; font-size: 0.85rem; font-weight: 500;">${skill}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    container.innerHTML = html;
  },

  /**
   * Export the provided DOM element to a PDF file
   * @param {HTMLElement} element 
   * @param {string} filename 
   */
  exportToPDF(element, filename = 'cv.pdf') {
    const opt = {
      margin:       0.5,
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    // We clone the element so we don't modify the visible UI if we need to tweak styles for PDF
    const clone = element.cloneNode(true);
    html2pdf().set(opt).from(clone).save();
  },

  /**
   * Export the structured data directly to a Word document (.docx)
   * @param {Object} data 
   * @param {string} filename 
   */
  async exportToWord(data, filename = 'cv.docx') {
    
    const children = [];

    // Header
    children.push(new Paragraph({
      text: data.name || 'Candidate Name',
      heading: HeadingLevel.HEADING_1,
    }));

    const contactText = [];
    if (data.email) contactText.push(data.email);
    if (data.phone) contactText.push(data.phone);

    if (contactText.length > 0) {
      children.push(new Paragraph({
        text: contactText.join(' | '),
      }));
    }

    // Summary
    if (data.summary) {
      children.push(new Paragraph({ text: "Professional Summary", heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: data.summary }));
    }

    // Education
    if (data.education && data.education.length > 0) {
      children.push(new Paragraph({ text: "Education", heading: HeadingLevel.HEADING_2 }));
      data.education.forEach(edu => {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: edu.school || 'School', bold: true }),
            new TextRun({ text: `\t${edu.year || ''}` }), // Tab separation for alignment
          ]
        }));
        children.push(new Paragraph({ text: edu.degree || 'Degree' }));
      });
    }

    // Experience
    if (data.experience && data.experience.length > 0) {
      children.push(new Paragraph({ text: "Experience", heading: HeadingLevel.HEADING_2 }));
      data.experience.forEach(exp => {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: exp.title || 'Job Title', bold: true }),
            new TextRun({ text: `\t${exp.duration || ''}` }),
          ]
        }));
        children.push(new Paragraph({
          children: [
            new TextRun({ text: exp.company || 'Company', italics: true }),
          ]
        }));
        
        // Handle multiline description
        if (exp.description) {
          const lines = exp.description.split('\n');
          lines.forEach(line => {
            if (line.trim()) {
              children.push(new Paragraph({ text: line.trim() }));
            }
          });
        }
      });
    }

    // Skills
    if (data.skills && data.skills.length > 0) {
      children.push(new Paragraph({ text: "Skills", heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: data.skills.join(', ') }));
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, filename);
  }
};
