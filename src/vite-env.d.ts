declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY?: string;
  }
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}