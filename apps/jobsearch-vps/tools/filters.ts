export const EXACT_ROLE_PHRASES = [
  'forward deployed', 'fde', 'solutions engineer', 'sales engineer',
  'implementation engineer', 'embedded engineer', "founder's associate", 'founders associate',
  'ai product', 'gtm engineer', 'customer engineer', 'technical account manager',
  'field engineer', 'automation engineer', 'ai product manager',
];

export const AI_ENGINEER_SIGNALS = [
  'ai', 'ml', 'machine learning', 'automation', 'llm', 'nlp', 'agentic', 'agent', 'robotics',
];

export const EXCLUDE_TITLE_PHRASES = [
  // founding roles
  'founding engineer', 'founding full stack', 'founding fullstack', 'founding backend',
  'founding frontend', 'founding ml', 'founding machine learning', 'founding ai engineer',
  'founding software engineer', 'founding ai software',
  // senior/staff IC roles
  'senior software engineer', 'staff software engineer',
  'senior full stack', 'senior fullstack', 'senior backend', 'senior frontend', 'senior full-stack',
  // pure eng roles
  'backend engineer', 'frontend engineer', 'fullstack engineer',
  'full stack engineer', 'full-stack engineer',
  'software engineer, data', 'data engineer', 'data platform',
  'devops engineer', 'infrastructure engineer',
  // research / ML
  'research engineer', 'ml researcher', 'research scientist',
  'machine learning engineer', 'ml engineer',
  // misc
  'software / ai engineering', 'voice ai',
];

export const EXCLUDE_TITLE_EXTRA = [
  'intern', 'internship', 'co-op', 'principal ', 'staff ml',
  'short-form content', 'content creator', 'data collection',
];

export function matchesRole(title: string): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  if (EXCLUDE_TITLE_PHRASES.some(kw => lower.includes(kw))) return false;
  if (EXCLUDE_TITLE_EXTRA.some(kw => lower.includes(kw))) return false;
  if (EXACT_ROLE_PHRASES.some(kw => lower.includes(kw))) return true;
  if (lower.includes('engineer') && AI_ENGINEER_SIGNALS.some(kw => lower.includes(kw))) return true;
  return false;
}

