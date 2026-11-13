/**
 * public/js/recommendations.js
 * Contextual intelligence engine for the "For You" section.
 * Analyzes conversation history to surface personalized follow-ups, explored topics,
 * and key verified portfolio highlights.
 */

const TOPIC_DEFINITIONS = [
  {
    id: 'superpower',
    name: 'Problem-Solving Superpower',
    keywords: ['superpower', 'problem', 'solve', 'root cause', 'queries', 'dashboard'],
    category: 'Strengths'
  },
  {
    id: 'fci_ccm',
    name: 'FCI CCM Data & AI Tools',
    keywords: ['fci', 'ccm', 'varta', 'pipeline', 'databricks', 'pyspark', 'tickets'],
    category: 'Work Experience'
  },
  {
    id: 'education',
    name: 'Education: IIT Ropar & IIM Amritsar',
    keywords: ['education', 'rizvi', 'ropar', 'amritsar', 'iit', 'iim', 'master', 'degree'],
    category: 'Background'
  },
  {
    id: 'limits',
    name: 'Pushing Limits & Java RAG Agent',
    keywords: ['limit', 'boundary', 'push', 'java', 'rag', 'ast', 'tree-sitter', 'faiss'],
    category: 'Engineering Mindset'
  },
  {
    id: 'growth',
    name: 'End-to-End AI Growth Goals',
    keywords: ['grow', 'growth', 'goal', 'future', 'leadership', 'vision', 'product'],
    category: 'Career Vision'
  },
  {
    id: 'origins',
    name: 'Origins & Early Curiosity (Bandra)',
    keywords: ['bandra', 'origin', 'childhood', 'family', 'eleven', 'computer-help'],
    category: 'Personal Journey'
  },
  {
    id: 'perception',
    name: 'Coworker Misconception vs Reality',
    keywords: ['misconception', 'coworker', 'serious', 'funny', 'culture', 'humor'],
    category: 'Team Dynamics'
  }
];

const QUESTION_CATALOG = [
  {
    topicId: 'fci_ccm',
    question: 'How did you speed up data pipelines by 45% across 4.5 million records?',
    tag: 'Data Engineering'
  },
  {
    topicId: 'fci_ccm',
    question: 'What is ProductLens and how did it cut ticket review time by 60%?',
    tag: 'Generative AI'
  },
  {
    topicId: 'fci_ccm',
    question: 'How does your document checking RAG service reach 92% agreement?',
    tag: 'RAG Architecture'
  },
  {
    topicId: 'superpower',
    question: 'Can you walk me through your root-cause problem solving approach?',
    tag: 'Core Strength'
  },
  {
    topicId: 'limits',
    question: 'Tell me about the Java bug-fixing agent and why you chose to stop it.',
    tag: 'Product Judgment'
  },
  {
    topicId: 'education',
    question: 'Why did you choose to combine technical studies at IIT Ropar with IIM Amritsar?',
    tag: 'Tech + Business'
  },
  {
    topicId: 'growth',
    question: 'What is your 3-to-5 year vision for leading agentic AI solutions?',
    tag: 'Future Vision'
  },
  {
    topicId: 'perception',
    question: 'What is the biggest misconception people have before getting to know you?',
    tag: 'Culture Fit'
  }
];

const PORTFOLIO_HIGHLIGHTS = [
  {
    title: '45% Pipeline Acceleration',
    metric: '4.5M Records',
    description: 'Cross-channel ETL pipelines optimized on Databricks with PySpark & SQL for banking clients.',
    promptQuestion: 'How did you optimize cross-channel pipelines across 4.5 million records?'
  },
  {
    title: 'ProductLens Ticket Insights',
    metric: '60% Review Cut (F1: 0.89)',
    description: 'Classified 25,000 feedback tickets from Zoho Desk & Jira into prioritized product insights with data science team.',
    promptQuestion: 'What did you build with ProductLens to cut review time by 60%?'
  },
  {
    title: 'RAG Document Verification',
    metric: '12,000 Docs / Mo',
    description: 'Autonomous document validation microservice achieving 92% agreement with manual review.',
    promptQuestion: 'How did you build the document checking RAG tool at FCI CCM?'
  },
  {
    title: 'Tech + Business Dual Degree',
    metric: 'IIT Ropar + IIM Amritsar',
    description: 'M.S. in Data Science & Management bridging technical model building with stakeholder business value.',
    promptQuestion: 'How does your management study at IIM Amritsar shape your engineering work?'
  }
];

/**
 * Analyzes conversation history across all messages
 * @param {Array<Object>} history - list of { role, text }
 * @returns {Object} Personalized recommendations data
 */
export function generateRecommendations(history = []) {
  const allUserText = history
    .filter(m => m.role === 'user')
    .map(m => m.text.toLowerCase())
    .join(' ');

  // 1. Identify which topics have been explored
  const exploredTopics = [];
  const unexploredTopics = [];

  for (const topic of TOPIC_DEFINITIONS) {
    const isExplored = topic.keywords.some(kw => allUserText.includes(kw));
    if (isExplored) {
      exploredTopics.push(topic);
    } else {
      unexploredTopics.push(topic);
    }
  }

  // 2. Select prioritized recommended questions
  // Prioritize questions from unexplored topics first, then relevant extensions
  const recommendedQuestions = [];

  // Pick questions from unexplored topics
  for (const unexp of unexploredTopics) {
    const q = QUESTION_CATALOG.find(item => item.topicId === unexp.id);
    if (q && !recommendedQuestions.includes(q)) {
      recommendedQuestions.push(q);
    }
  }

  // Fill remaining slots from catalog
  for (const item of QUESTION_CATALOG) {
    if (recommendedQuestions.length >= 4) break;
    if (!recommendedQuestions.includes(item)) {
      recommendedQuestions.push(item);
    }
  }

  return {
    exploredCount: exploredTopics.length,
    totalTopics: TOPIC_DEFINITIONS.length,
    exploredTopics,
    unexploredTopics,
    recommendedQuestions: recommendedQuestions.slice(0, 4),
    highlights: PORTFOLIO_HIGHLIGHTS
  };
}
