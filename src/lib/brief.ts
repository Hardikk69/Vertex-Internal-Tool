// The onboarding questionnaire. Answers are stored in client_briefs.answers as
// { [question id]: string | string[] }, so ids must stay stable once a brief is filled in.
export type Question = {
  id: string;
  label: string;
  type: "text" | "long" | "choices";
  required?: boolean;
  options?: string[];
  hint?: string;
};

export const BRIEF: { title: string; questions: Question[] }[] = [
  {
    title: "About the brand",
    questions: [
      { id: "brand", label: "Brand name", type: "text", required: true },
      { id: "website", label: "Website", type: "text", hint: "Leave blank if you don't have one yet" },
      { id: "socials", label: "Social handles", type: "long", hint: "Instagram, YouTube, LinkedIn…" },
      { id: "about", label: "What does the brand do?", type: "long", required: true },
      {
        id: "audience",
        label: "Who are you talking to?",
        type: "long",
        required: true,
        hint: "Age, city, interests, the kind of customer you want more of",
      },
    ],
  },
  {
    title: "This project",
    questions: [
      {
        id: "goals",
        label: "What do you want to achieve in the next 3 months?",
        type: "long",
        required: true,
      },
      {
        id: "services",
        label: "What do you need from us?",
        type: "choices",
        required: true,
        options: [
          "Reels & short-form",
          "Video shoots",
          "Editing",
          "Photography",
          "Ad creatives",
          "Branding & design",
          "Social media management",
        ],
      },
      {
        id: "platforms",
        label: "Where does it get posted?",
        type: "choices",
        options: ["Instagram", "YouTube", "LinkedIn", "Facebook", "X", "WhatsApp", "Website"],
      },
      { id: "frequency", label: "How often do you want to post?", type: "text", hint: "e.g. 8 reels a month" },
      { id: "dates", label: "Deadlines or key dates", type: "long", hint: "Launches, festivals, events" },
    ],
  },
  {
    title: "Style & assets",
    questions: [
      { id: "references", label: "Pages or videos you love", type: "long", hint: "Paste links" },
      { id: "tone", label: "Tone, do's and don'ts", type: "long", hint: "Anything we should never do" },
      {
        id: "assets",
        label: "Where are your logo and brand files?",
        type: "text",
        hint: "A Drive or Dropbox link, or say “in the chat” and send them there",
      },
      { id: "contact", label: "Main contact and phone number", type: "text", required: true },
      { id: "notes", label: "Anything else we should know?", type: "long" },
    ],
  },
];

export type Answers = Record<string, string | string[]>;

const answered = (a: Answers[string] | undefined) => (Array.isArray(a) ? a.length > 0 : !!a?.trim());
export const questions = BRIEF.flatMap((s) => s.questions);
export const missing = (answers: Answers) =>
  questions.filter((q) => q.required && !answered(answers[q.id])).length;
