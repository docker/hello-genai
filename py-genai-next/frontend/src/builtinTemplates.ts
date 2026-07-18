import type { Template } from "./components/Composer";

// Always-available slash commands. They expand into a ready-to-run prompt when
// you type "/trigger" in the composer. Negative ids keep them distinct from the
// user's own server-stored templates (which override these by trigger).
export const BUILTIN_TEMPLATES: Template[] = [
  { trigger: "summarize", title: "Summarize", content: "Summarize the following clearly and concisely:\n\n" },
  { trigger: "tldr", title: "TL;DR", content: "Give a 3-bullet TL;DR of the following:\n\n" },
  { trigger: "explain", title: "Explain simply", content: "Explain the following in simple, clear terms:\n\n" },
  { trigger: "eli5", title: "Explain like I'm 5", content: "Explain the following like I'm five years old:\n\n" },
  { trigger: "improve", title: "Improve writing", content: "Improve the writing below for clarity, grammar, and tone. Keep my meaning:\n\n" },
  { trigger: "rewrite", title: "Rewrite concisely", content: "Rewrite the following to be clearer and more concise:\n\n" },
  { trigger: "tone", title: "Change tone", content: "Rewrite the following in a professional, friendly tone:\n\n" },
  { trigger: "translate", title: "Translate", content: "Translate the following into English (state the source language):\n\n" },
  { trigger: "review", title: "Review code", content: "Review the following code for bugs, security issues, and best practices. Give concrete fixes:\n\n```\n\n```" },
  { trigger: "fix", title: "Fix a bug", content: "Find and fix the bug in the following code. Explain what was wrong:\n\n```\n\n```" },
  { trigger: "refactor", title: "Refactor code", content: "Refactor the following code for readability and performance without changing its behavior:\n\n```\n\n```" },
  { trigger: "tests", title: "Write tests", content: "Write thorough unit tests for the following code, covering edge cases:\n\n```\n\n```" },
  { trigger: "explain-code", title: "Explain code", content: "Explain what the following code does, step by step:\n\n```\n\n```" },
  { trigger: "document", title: "Add docs", content: "Add clear docstrings and inline comments to the following code:\n\n```\n\n```" },
  { trigger: "steps", title: "Step-by-step", content: "Break the following down into clear, numbered step-by-step instructions:\n\n" },
  { trigger: "outline", title: "Outline", content: "Create a structured outline for the following topic:\n\n" },
  { trigger: "brainstorm", title: "Brainstorm", content: "Brainstorm 10 creative, distinct ideas about:\n\n" },
  { trigger: "pros-cons", title: "Pros & cons", content: "List the key pros and cons of the following, then give a recommendation:\n\n" },
].map((t, i) => ({ ...t, id: -(i + 1) }));
