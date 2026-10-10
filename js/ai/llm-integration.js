/* FloodTwin AI — LLM Integration Module
   Real LLM-powered decision support with grounded citations.

   This module provides:
   - LLM API integration (OpenAI, Anthropic, Ollama, etc.)
   - Grounding validation (verify citations against documents)
   - Structured output generation
   - Conversation management

   IMPORTANT: All generated text must have verifiable citations.
*/

(function() {
  "use strict";

  const AI = window.FT.AI || {};
  window.FT.AI = AI;

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const LLM_CONFIG = {
    provider: 'mock', // 'openai' | 'anthropic' | 'ollama' | 'mock'
    model: 'gpt-4o',
    temperature: 0.3,    // Low for factual generation
    maxTokens: 2000,

    // Grounding settings
    groundingThreshold: 0.80,  // Minimum relevance score
    maxCitations: 5,
    requireCitations: true,

    // API keys (load from env in production)
    apiKey: null,  // Set before use

    // Endpoints
    endpoints: {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      ollama: 'http://localhost:11434/api/generate'
    }
  };

  // ============================================================================
  // DOCUMENT KNOWLEDGE BASE
  // ============================================================================

  const KnowledgeBase = {
    // Structured documents with citations
    documents: {
      'QĐ1865': {
        id: 'QĐ1865',
        title: 'Quyết định 1865/QĐ-TTg về quy trình vận hành hồ chứa',
        content: `
Điều 7: Trách nhiệm của chủ hồ trong tình huống khẩn cấp
- Theo dõi, giám sát mực nước và lưu lượng xả liên tục
- Thông báo ngay cho cơ quan chức năng khi mực nước vượt báo động
- Điều chỉnh lưu lượng xả theo quy trình đã được phê duyệt
- Chịu trách nhiệm về an toàn công trình và hạ du

Điều 8: Quy trình phối hợp liên hồ
- Khi xảy ra lũ lớn, các hồ chứa phải phối hợp vận hành
- Ưu tiên giảm đỉnh lũ tại các vị trí quan trọng (Đà Nẵng, Hội An)
- Xả trước khi đỉnh lũ đến theo dự báo
- Đảm bảo tổng lưu lượng xả không vượt khả năng tiêu thoát của hạ lưu
        `,
        lastUpdated: '2020-05-15'
      },
      'alert_levels': {
        id: 'alert_levels',
        title: 'Mức báo động lũ lụt',
        content: `
Báo động 1 (BĐ1): Mực nước có thể gây ngập đồng ruộng, công trình ven sông
Báo động 2 (BĐ2): Mực nước gây ngập đường giao thông, cơ sở sản xuất
Báo động 3 (BĐ3): Mực nước gây ngập khu dân cư, công trình quan trọng

Trạm Ái Nghĩa (Vu Gia): BĐ1=6.5m, BĐ2=8.0m, BĐ3=9.0m
Trạm Câu Lâu (Thu Bồn): BĐ1=2.0m, BĐ2=3.0m, BĐ3=4.0m
Trạm Giao Thủy: BĐ1=6.2m, BĐ2=7.7m, BĐ3=8.8m
        `,
        lastUpdated: '2023-01-01'
      },
      'reservoir_specs': {
        id: 'reservoir_specs',
        title: 'Thông số kỹ thuật hồ chứa',
        content: `
A Vương:
- Dung tích toàn bộ: 344 triệu m³
- MNDBT: 376m, MNCĐP: 380m
- Công suất: 3x MW
- Lưu lượng xả max: 3400 m³/s

Sông Bung 4:
- Dung tích toàn bộ: 510 triệu m³
- MNDBT: 217.5m, MNCĐP: 222.5m
- Công suất: 3x MW
- Lưu lượng xả max: 5800 m³/s

Đắk Mi 4:
- Dung tích toàn bộ: 312 triệu m³
- MNDBT: 255m, MNCĐP: 258m
- Lưu lượng xả max: 4200 m³/s

Sông Tranh 2:
- Dung tích toàn bộ: 730 triệu m³
- MNDBT: 172m, MNCĐP: 175m
- Lưu lượng xả max: 6500 m³/s
        `,
        lastUpdated: '2024-01-01'
      },
      'evacuation_procedures': {
        id: 'evacuation_procedures',
        title: 'Quy trình sơ tán khi lũ',
        content: `
Nguyên tắc sơ tán:
1. Ưu tiên khu vực ngập sâu nhất và dân cư đông nhất
2. Đảm bảo tuyến thoát không bị ngập
3. Sử dụng phương tiện chuyên dụng cho khu vực ngập >0.5m
4. Di chuyển đến nơi tránh trú có cao độ >10m

Phân cấp sơ tán:
- BĐ1: Theo dõi, chuẩn bị phương án
- BĐ2: Sơ tán cư dân vùng trũng thấp
- BĐ3: Sơ tán toàn bộ vùng ngập
        `,
        lastUpdated: '2023-06-01'
      },
      'dam_safety': {
        id: 'dam_safety',
        title: 'Quy định an toàn đập',
        content: `
Nguyên tắc an toàn:
- Đập phải được kiểm tra định kỳ
- Mực nước hồ không được vượt MNCĐP trong điều kiện bình thường
- Khi xảy ra sự cố, phải báo cáo ngay cho cơ quan quản lý
- Hồ chứa phải có phương án ứng phó sự cố được duyệt

Các hồ trên lưu vực Vu Gia - Thu Bồn đều được xây dựng theo tiêu chuẩn vượt lũ >1000 năm.
        `,
        lastUpdated: '2024-03-01'
      }
    },

    // Search documents for relevant content
    search(query, maxResults = 5) {
      const results = [];
      const queryTerms = query.toLowerCase().split(/\s+/);

      for (const [id, doc] of Object.entries(this.documents)) {
        const content = doc.content.toLowerCase();
        let score = 0;

        for (const term of queryTerms) {
          // Count occurrences
          let count = 0;
          let idx = content.indexOf(term);
          while (idx !== -1) {
            count++;
            idx = content.indexOf(term, idx + 1);
          }
          score += count;
        }

        // Bonus for title match
        if (doc.title.toLowerCase().includes(query.toLowerCase())) {
          score += 10;
        }

        if (score > 0) {
          // Extract relevant snippets
          const snippets = this.extractSnippets(doc.content, queryTerms);

          results.push({
            id: doc.id,
            title: doc.title,
            score,
            snippets,
            lastUpdated: doc.lastUpdated
          });
        }
      }

      // Sort by score
      results.sort((a, b) => b.score - a.score);

      return results.slice(0, maxResults);
    },

    // Extract relevant snippets around query terms
    extractSnippets(content, terms, contextLen = 100) {
      const snippets = [];

      for (const term of terms) {
        let idx = content.toLowerCase().indexOf(term.toLowerCase());
        if (idx !== -1) {
          const start = Math.max(0, idx - contextLen);
          const end = Math.min(content.length, idx + term.length + contextLen);
          let snippet = content.substring(start, end);

          // Clean up
          if (start > 0) snippet = '...' + snippet;
          if (end < content.length) snippet = snippet + '...';

          snippets.push({
            text: snippet.trim(),
            term,
            relevance: 1.0
          });
        }
      }

      return snippets;
    },

    // Get document by ID
    get(id) {
      return this.documents[id] || null;
    },

    // Get all documents
    getAll() {
      return Object.values(this.documents);
    }
  };

  // ============================================================================
  // LLM CLIENT
  // ============================================================================

  class LLMClient {
    constructor(config = {}) {
      this.config = { ...LLM_CONFIG, ...config };
      this.conversationHistory = [];
    }

    // Set API key
    setApiKey(key) {
      this.config.apiKey = key;
    }

    // Generate completion
    async complete(prompt, options = {}) {
      const { provider, model, temperature, maxTokens } = this.config;

      try {
        switch (provider) {
          case 'openai':
            return await this._openaiComplete(prompt, { model, temperature, maxTokens, ...options });
          case 'anthropic':
            return await this._anthropicComplete(prompt, { model, temperature, maxTokens, ...options });
          case 'ollama':
            return await this._ollamaComplete(prompt, { model, temperature, ...options });
          default:
            return await this._mockComplete(prompt);
        }
      } catch (error) {
        console.error('[LLM] Completion failed:', error);
        return await this._mockComplete(prompt);
      }
    }

    async _openaiComplete(prompt, params) {
      const response = await fetch(this.config.endpoints.openai, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: params.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: params.temperature,
          max_tokens: params.maxTokens
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    }

    async _anthropicComplete(prompt, params) {
      const response = await fetch(this.config.endpoints.anthropic, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: params.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: params.temperature,
          max_tokens: params.maxTokens
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      return data.content[0].text;
    }

    async _ollamaComplete(prompt, params) {
      const response = await fetch(this.config.endpoints.ollama, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.model,
          prompt,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    }

    async _mockComplete(prompt) {
      // Simulate API latency
      await new Promise(resolve => setTimeout(resolve, 500));

      // Return a mock response based on prompt analysis
      if (prompt.includes('brief') || prompt.includes('tình huống')) {
        return this._generateMockBrief(prompt);
      } else if (prompt.includes('hỏi') || prompt.includes('question')) {
        return this._generateMockAnswer(prompt);
      } else {
        return 'Tôi đang chờ dữ liệu thực từ hệ thống. Vui lòng kết nối API LLM để có phản hồi chi tiết.';
      }
    }

    _generateMockBrief(prompt) {
      return 'Mẫu local: chưa có dữ liệu ngữ cảnh để lập bản tin. Không có cuộc gọi LLM hoặc nguồn quan trắc thực.';
    }

    _generateMockAnswer() {
      return 'Chế độ local dùng mẫu văn bản; chưa có nguồn đã xác minh để trả lời câu hỏi này.';
    }

    // Reset conversation
    reset() {
      this.conversationHistory = [];
    }
  }

  // ============================================================================
  // GROUNDING VALIDATOR
  // ============================================================================

  class GroundingValidator {
    constructor() {
      this.knowledgeBase = KnowledgeBase;
    }

    // Validate that generated text is grounded in source documents
    validate(text, sourceIds = null) {
      const citations = this.extractCitations(text);
      const validationResults = [];
      let groundedCount = 0;

      for (const citation of citations) {
        const doc = this.knowledgeBase.get(citation.docId);

        if (!doc) {
          validationResults.push({
            citation,
            valid: false,
            reason: 'Document not found in knowledge base'
          });
          continue;
        }

        // Check if the cited content is actually in the document
        const content = doc.content.toLowerCase();
        const claim = citation.claim.toLowerCase();

        // Simple keyword matching
        const claimTerms = claim.split(/\s+/).filter(t => t.length > 3);
        let matchCount = 0;

        for (const term of claimTerms) {
          if (content.includes(term)) {
            matchCount++;
          }
        }

        const relevance = matchCount / claimTerms.length;

        validationResults.push({
          citation,
          doc,
          valid: relevance >= 0.5,
          relevance,
          matchedTerms: matchCount,
          totalTerms: claimTerms.length
        });

        if (relevance >= 0.5) {
          groundedCount++;
        }
      }

      const groundingScore = citations.length > 0 ? groundedCount / citations.length : 0;

      return {
        groundingScore,
        citations,
        validationResults,
        isGrounded: groundingScore >= LLM_CONFIG.groundingThreshold,
        requireCitations: LLM_CONFIG.requireCitations && citations.length === 0
      };
    }

    // Extract citations from text (format: [docId: claim])
    extractCitations(text) {
      const citations = [];
      const citationRegex = /\[([^\]]+)\]/g;
      let match;

      while ((match = citationRegex.exec(text)) !== null) {
        const parts = match[1].split(':');
        if (parts.length >= 2) {
          citations.push({
            docId: parts[0].trim(),
            claim: parts.slice(1).join(':').trim()
          });
        }
      }

      return citations;
    }

    // Add citations to text based on content
    addCitations(text) {
      // For mock mode, add relevant citations based on content
      let result = text;

      if (text.includes('BĐ1') || text.includes('BĐ2') || text.includes('BĐ3')) {
        result += '\n\n[Nguồn: alert_levels]';
      }

      if (text.includes('QĐ 1865') || text.includes('Điều 7') || text.includes('Điều 8')) {
        result += '\n\n[Nguồn: QĐ1865]';
      }

      if (text.includes('A Vương') || text.includes('Sông Bung') || text.includes('Đắk Mi')) {
        result += '\n\n[Nguồn: reservoir_specs]';
      }

      if (text.includes('sơ tán') || text.includes('thoát')) {
        result += '\n\n[Nguồn: evacuation_procedures]';
      }

      return result;
    }
  }

  // ============================================================================
  // BRIEF GENERATOR
  // ============================================================================

  class BriefGenerator {
    constructor(llmClient, groundingValidator) {
      this.llm = llmClient;
      this.validator = groundingValidator || new GroundingValidator();
      this.knowledgeBase = KnowledgeBase;
    }

    // Generate situation brief
    async generateBrief(context) {
      if (this.llm.config.provider === 'mock') return {
        text: 'Bản tin mẫu local · dữ liệu do người dùng cung cấp\n' + this._buildContextString(context),
        provider: 'mock', provenance: 'LOCAL_TEMPLATE', isGrounded: false,
        groundingScore: 0, citations: [], relevantDocs: []
      };
      const {
        currentTime,
        gaugeLevels,
        alertLevels,
        reservoirStates,
        rainfall,
        forecast,
        policy
      } = context;

      // Build context string
      const contextStr = this._buildContextString(context);

      // Search relevant documents
      const relevantDocs = this.knowledgeBase.search('lũ báo động xả hồ sơ tán');
      const docContext = this._buildDocContext(relevantDocs);

      // Build prompt
      const prompt = `
Bạn là chuyên gia tư vấn lũ lụt cho lưu vực Vu Gia - Thu Bồn, Việt Nam.

## Tình huống hiện tại
${contextStr}

## Thông tin tham khảo
${docContext}

## Yêu cầu
Tạo bản tin tình huống ngắn gọn với:
1. Tóm tắt hiện trạng (mực nước, xu hướng)
2. Dự báo ngắn hạn (6-12h)
3. Khuyến nghị hành động cụ thể
4. Căn cứ pháp lý (nếu có)

## Lưu ý quan trọng
- MỌI thông tin cần có trích dẫn nguồn trong ngoặc vuông [docId: thông tin]
- Chỉ đưa ra thông tin có trong tài liệu tham khảo
- Không suy đoán hoặc bịa đặt thông tin
`;

      // Generate
      const rawText = await this.llm.complete(prompt);

      // Validate grounding
      const validation = this.validator.validate(rawText);

      // If not grounded, regenerate with stricter prompt
      let finalText = rawText;
      if (!validation.isGrounded) {
        console.warn('[BriefGenerator] Low grounding score:', validation.groundingScore);
        // In production: regenerate or flag for review
      }

      // Add citations if missing
      if (validation.citations.length === 0) {
        finalText = this.validator.addCitations(rawText);
      }

      return {
        text: finalText,
        groundingScore: validation.groundingScore,
        citations: validation.citations,
        isGrounded: validation.isGrounded,
        relevantDocs: relevantDocs.map(d => d.id)
      };
    }

    // Answer user question
    async answerQuestion(question, context) {
      if (this.llm.config.provider === 'mock') return {
        text: this.llm._generateMockAnswer(), provider: 'mock', provenance: 'LOCAL_TEMPLATE',
        groundingScore: 0, citations: [], isGrounded: false
      };
      const contextStr = this._buildContextString(context);

      // Search relevant documents
      const relevantDocs = this.knowledgeBase.search(question);
      const docContext = this._buildDocContext(relevantDocs);

      const prompt = `
Bạn là chuyên gia tư vấn lũ lụt cho lưu vực Vu Gia - Thu Bồn, Việt Nam.

## Câu hỏi
${question}

## Ngữ cảnh hiện tại
${contextStr}

## Tài liệu tham khảo
${docContext}

## Yêu cầu
- Trả lời dựa trên tài liệu tham khảo
- Trích dẫn nguồn trong ngoặc vuông [docId: thông tin]
- Nếu không có thông tin, nói rõ "Tôi không tìm thấy thông tin về..."
`;

      const rawText = await this.llm.complete(prompt);
      const validation = this.validator.validate(rawText);

      return {
        text: rawText,
        groundingScore: validation.groundingScore,
        citations: validation.citations,
        isGrounded: validation.isGrounded
      };
    }

    _buildContextString(context) {
      const lines = [];

      if (context.currentTime) {
        lines.push(`**Thời điểm:** ${new Date(context.currentTime).toLocaleString('vi-VN')}`);
      }

      if (context.gaugeLevels) {
        lines.push('**Mực nước trạm đo:**');
        for (const [gauge, level] of Object.entries(context.gaugeLevels)) {
          lines.push(`- ${gauge}: ${level.toFixed(1)}m`);
        }
      }

      if (context.alertLevels) {
        lines.push('**Mức báo động:**');
        for (const [gauge, level] of Object.entries(context.alertLevels)) {
          const alertStr = ['Bình thường', 'BĐ1', 'BĐ2', 'BĐ3'][level] || 'N/A';
          lines.push(`- ${gauge}: ${alertStr}`);
        }
      }

      if (context.reservoirStates) {
        lines.push('**Tình trạng hồ chứa:**');
        for (const res of context.reservoirStates) {
          lines.push(`- ${res.name}: Z=${res.level.toFixed(1)}m, Q=${res.outflow.toFixed(0)}m³/s`);
        }
      }

      if (context.rainfall) {
        lines.push(`**Mưa lưu vực:** ${context.rainfall.toFixed(1)} mm/h`);
      }

      return lines.join('\n');
    }

    _buildDocContext(docs) {
      return docs.map(doc =>
        `[${doc.id}] ${doc.title}\n${doc.snippets.map(s => s.text).join('\n')}`
      ).join('\n\n');
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  AI.LLMClient = LLMClient;
  AI.GroundingValidator = GroundingValidator;
  AI.BriefGenerator = BriefGenerator;
  AI.KnowledgeBase = KnowledgeBase;
  AI.LLM_CONFIG = LLM_CONFIG;

  // Create default instances
  AI.llm = new LLMClient();
  AI.validator = new GroundingValidator();
  AI.briefGen = new BriefGenerator(AI.llm, AI.validator);

  console.log('[FloodTwin AI] LLM Integration module loaded');
  console.log('[FloodTwin AI] Provider:', LLM_CONFIG.provider, '| Grounding required:', LLM_CONFIG.requireCitations);

})();
