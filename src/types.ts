export type Risk = "navigation" | "input" | "blocked";
export type ControlKind = "radio" | "checkbox" | "text" | "textarea" | "select" | "file";

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

export type SnapshotControlOption = {
  text: string;
  value: string;
  selected: boolean;
  disabled: boolean;
};

export type SnapshotControl = {
  id: string;
  kind: ControlKind;
  label: string;
  name?: string;
  checked?: boolean;
  disabled: boolean;
  required: boolean;
  accept?: string;
  multiple?: boolean;
  hasValue?: boolean;
  options?: SnapshotControlOption[];
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
  markdown: string;
  visibleText: string;
  headings: string[];
  links: SnapshotLink[];
  buttons: SnapshotButton[];
  controls: SnapshotControl[];
  forms: SnapshotForm[];
};

export type ClickTarget = {
  id: string;
  selector: string;
  index: number;
  text: string;
  href?: string;
  risk: Risk;
  kind?: "link" | "button" | "control";
  controlKind?: ControlKind;
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

export type RawControlOption = {
  text: string;
  value: string;
  selected: boolean;
  disabled: boolean;
};

export type RawControl = {
  kind: ControlKind;
  label: string;
  name?: string;
  value?: string;
  selector: string;
  index: number;
  checked?: boolean;
  disabled: boolean;
  required: boolean;
  accept?: string;
  multiple?: boolean;
  inputType?: string;
  options?: RawControlOption[];
};

export type RawForm = {
  fields: string[];
};

export type RawPageSnapshot = {
  url: string;
  title: string;
  markdown: string;
  visibleText: string;
  headings: string[];
  links: RawLink[];
  buttons: RawButton[];
  controls: RawControl[];
  forms: RawForm[];
};

export type SearchResult = {
  url: string;
  title: string;
  capturedAt: string;
  snippet: string;
};
