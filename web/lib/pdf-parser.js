/**
 * PDF Text Extractor using pdfjs-dist
 */

import * as pdfjsLib from 'pdfjs-dist';

// We need to set the workerSrc for pdf.js to work in browser.
// Since we are in Next.js, we can load it from a CDN for simplicity, 
// or point to a local public path if we host it.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const PDFParser = {
  /**
   * Extract all text from a PDF File object
   * @param {File} file 
   * @returns {Promise<string>}
   */
  async extractTextFromPDF(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
      }
      
      return fullText;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error('PDF 文本解析失败，请确保文件未加密且格式正确 / Failed to parse PDF text, ensure file is unencrypted and valid.');
    }
  }
};
