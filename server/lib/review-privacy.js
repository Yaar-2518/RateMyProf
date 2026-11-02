// Conservative local pre-screening. A clean result is not proof that text is
// anonymous: a moderator must explicitly clear the separate AI-safe copy.
export function privacyFlags(value) {
  const flags = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) flags.push("email_address");
  if (/(?:\+?\d[\s().-]*){10,}/.test(value)) flags.push("phone_or_identifier");
  if (/\b(?:roll|registration|student|admission)\s*(?:no\.?|number|id)\s*[:#-]?\s*[a-z0-9-]{4,}/i.test(value)) flags.push("student_identifier");
  if (/\b(?:home address|lives at|hostel room|medical condition|diagnosed with)\b/i.test(value)) flags.push("possible_sensitive_information");
  return flags;
}

export function localAssessment(value) {
  const flags = privacyFlags(value);
  if (/\b(?:fuck|shit|bastard|bitch|asshole)\b/i.test(value)) flags.push("possible_vulgarity");
  if (/\b(?:bribe|criminal|stole|corrupt|fraud)\b/i.test(value)) flags.push("allegation_needs_human_review");
  return { flags, recommendation: "human_review", explanation: "Local pre-screen complete. Confirm a de-identified copy before external AI screening. AI cannot determine whether allegations are true." };
}
