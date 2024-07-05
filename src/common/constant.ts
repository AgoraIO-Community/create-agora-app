import {Framework} from "../types"
import { blue, green, red, cyan, yellow } from "kolorist";

export const FRAMEWORKS: Framework[] = [
  {
    name: "vanilla-js",
    display: "Vanilla-js",
    color: yellow,
    variants: [
      {
        name: "vanilla-js",
        display: "JavaScript",
        color: blue,
      },
    ],
  },
  {
    name: "vue",
    display: "Vue",
    color: green,
    variants: [
      {
        name: "vue-ts",
        display: "TypeScript",
        color: blue,
      },
    ],
  },
  {
    name: "react",
    display: "React",
    color: cyan,
    variants: [
      {
        name: "react-ts",
        display: "TypeScript",
        color: blue,
      },
    ],
  },
  {
    name: "svelte",
    display: "Svelte",
    color: red,
    variants: [
      {
        name: "svelte-ts",
        display: "TypeScript",
        color: blue,
      },
    ],
  },
];

export const TEMPLATES = FRAMEWORKS.map(
  (f) => (f.variants && f.variants.map((v) => v.name)) || [f.name]
).reduce((a, b) => a.concat(b), []);
