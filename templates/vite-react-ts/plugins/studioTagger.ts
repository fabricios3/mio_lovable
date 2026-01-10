import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

type MapEntry = {
  file: string;
  component: string | null;
  line: number;
  column: number;
};

type StudioMap = Record<string, MapEntry>;

const hashId = (input: string) =>
  createHash("sha1").update(input).digest("hex").slice(0, 10);

const ensureStudioId = (
  filePath: string,
  componentName: string | null,
  line: number,
  column: number
) => {
  return `cmp_${hashId(`${filePath}:${componentName ?? "root"}:${line}:${column}`)}`;
};

export const studioTagger = (): Plugin => {
  const studioMap: StudioMap = {};
  const flushMap = async () => {
    const mapPath = path.join(process.cwd(), "studio-map.json");
    await fs.writeFile(mapPath, JSON.stringify(studioMap, null, 2));
  };
  return {
    name: "studio-tagger",
    buildStart() {
      for (const key of Object.keys(studioMap)) {
        delete studioMap[key];
      }
    },
    async transform(code, id) {
      if (!id.endsWith(".tsx") || id.includes("node_modules")) {
        return null;
      }
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });
      const filePath = path.relative(process.cwd(), id);
      const components: string[] = [];

      traverse(ast, {
        enter(path) {
          if (path.isFunctionDeclaration() && path.node.id?.name) {
            components.push(path.node.id.name);
          }
          if (path.isVariableDeclarator()) {
            if (
              t.isIdentifier(path.node.id) &&
              (t.isArrowFunctionExpression(path.node.init) ||
                t.isFunctionExpression(path.node.init))
            ) {
              components.push(path.node.id.name);
            }
          }
        },
        exit(path) {
          if (path.isFunctionDeclaration() && path.node.id?.name) {
            components.pop();
          }
          if (path.isVariableDeclarator()) {
            if (
              t.isIdentifier(path.node.id) &&
              (t.isArrowFunctionExpression(path.node.init) ||
                t.isFunctionExpression(path.node.init))
            ) {
              components.pop();
            }
          }
        },
        JSXOpeningElement(path) {
          const hasStudio = path.node.attributes.some(
            (attr) =>
              t.isJSXAttribute(attr) &&
              t.isJSXIdentifier(attr.name) &&
              attr.name.name === "data-studio-id"
          );
          const loc = path.node.loc?.start;
          if (!loc) return;
          const componentName = components[components.length - 1] ?? null;
          const studioId = ensureStudioId(filePath, componentName, loc.line, loc.column);
          if (!hasStudio) {
            path.node.attributes.push(
              t.jsxAttribute(t.jsxIdentifier("data-studio-id"), t.stringLiteral(studioId))
            );
          }
          studioMap[studioId] = {
            file: filePath,
            component: componentName,
            line: loc.line,
            column: loc.column,
          };
        },
      });

      const output = generate(ast, { retainLines: true }, code).code;
      return { code: output, map: null };
    },
    async handleHotUpdate() {
      await flushMap();
    },
    async writeBundle() {
      await flushMap();
    },
  };
};
