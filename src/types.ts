export type Risk = "navigation" | "blocked";

export type SnapshotLink = {
  id: string;
  text: string;
  href: string;
  risk: Risk;
};

export type SnapshotButton = {
  id: string;
  text: string;
  risk: Risk;
};

export type SnapshotForm = {
  id: string;
  fields: string[];
  risk: "blocked";
};

export type PageSnapshot = {
  url: string;
  title: string;
  capturedAt: string;
  visibleText: string;
  headings: string[];
  links: SnapshotLink[];
  buttons: SnapshotButton[];
  forms: SnapshotForm[];
};

export type ClickTarget = {
  id: string;
  selector: string;
  index: number;
  text: string;
  href?: string;
  risk: Risk;
};

export type RawLink = {
  text: string;
  href: string;
  selector: string;
  index: number;
};

export type RawButton = {
  text: string;
  href?: string;
  selector: string;
  index: number;
  role?: string;
};

export type RawForm = {
  fields: string[];
};

export type RawPageSnapshot = {
  url: string;
  title: string;
  visibleText: string;
  headings: string[];
  links: RawLink[];
  buttons: RawButton[];
  forms: RawForm[];
};

export type SearchResult = {
  url: string;
  title: string;
  capturedAt: string;
  snippet: string;
};
