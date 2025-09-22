import { marked } from "marked";

// Configure marked if you like
marked.setOptions({
  gfm: true,         // GitHub-flavored markdown
  breaks: true,      // Convert line breaks
});

export function render(markdown: string): string {
  return marked.parse(markdown) as string;
}