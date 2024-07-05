import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";
import minimist from "minimist";
import prompts from "prompts";
import { red, reset } from "kolorist";
import type { Framework } from "./types"
import {
  FRAMEWORKS, TEMPLATES, copy, isEmpty, toValidPackageName,
  emptyDir, isValidPackageName, formatTargetDir, setupReactSwc, pkgFromUserAgent
} from "./common"


const cwd = process.cwd();
const defaultTargetDir = "agora-project";
const renameFiles: Record<string, string | undefined> = {
  _gitignore: ".gitignore",
};



async function init() {
  // Avoids autoconversion to number of the project name by defining that the args
  // non associated with an option ( _ ) needs to be parsed as a string. See #4606
  const argv = minimist<{
    t?: string;
    template?: string;
  }>(process.argv.slice(2), { string: ["_"] });

  const argTargetDir = formatTargetDir(argv._[0]);
  const argTemplate = argv.template || argv.t;
  let targetDir = argTargetDir || defaultTargetDir;


  const getProjectName = () =>
    targetDir === "." ? path.basename(path.resolve()) : targetDir;

  let result: prompts.Answers<
    "projectName" | "overwrite" | "packageName" | "framework" | "variant"
  >;

  try {
    result = await prompts(
      [
        {
          type: argTargetDir ? null : "text",
          name: "projectName",
          message: reset("Project name:"),
          initial: defaultTargetDir,
          onState: (state) => {
            targetDir = formatTargetDir(state.value) || defaultTargetDir;
          },
        },
        {
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : "select",
          name: "overwrite",
          message: () =>
            (targetDir === "."
              ? "Current directory"
              : `Target directory "${targetDir}"`) +
            ` is not empty. Please choose how to proceed:`,
          initial: 0,
          choices: [
            {
              title: "Remove existing files and continue",
              value: "yes",
            },
            {
              title: "Cancel operation",
              value: "no",
            },
            {
              title: "Ignore files and continue",
              value: "ignore",
            },
          ],
        },
        {
          type: (_, { overwrite }: { overwrite?: string }) => {
            if (overwrite === "no") {
              throw new Error(red("✖") + " Operation cancelled");
            }
            return null;
          },
          name: "overwriteChecker",
        },
        {
          type: () => (isValidPackageName(getProjectName()) ? null : "text"),
          name: "packageName",
          message: reset("Package name:"),
          initial: () => toValidPackageName(getProjectName()),
          validate: (dir) =>
            isValidPackageName(dir) || "Invalid package.json name",
        },
        {
          type:
            argTemplate && TEMPLATES.includes(argTemplate) ? null : "select",
          name: "framework",
          message:
            typeof argTemplate === "string" && !TEMPLATES.includes(argTemplate)
              ? reset(
                `"${argTemplate}" isn't a valid template. Please choose from below: `
              )
              : reset("Select a framework:"),
          initial: 0,
          choices: FRAMEWORKS.map((framework) => {
            const frameworkColor = framework.color;
            return {
              title: frameworkColor(framework.display || framework.name),
              value: framework,
            };
          }),
        },
        {
          type: (framework: Framework) =>
            framework && framework.variants ? "select" : null,
          name: "variant",
          message: reset("Select a variant:"),
          choices: (framework: Framework) =>
            framework.variants.map((variant) => {
              const variantColor = variant.color;
              return {
                title: variantColor(variant.display || variant.name),
                value: variant.name,
              };
            }),
        },
      ],
      {
        onCancel: () => {
          throw new Error(red("✖") + " Operation cancelled");
        },
      }
    );
  } catch (cancelled: any) {
    console.log(cancelled.message);
    return;
  }

  // user choice associated with prompts
  const { framework, overwrite, packageName, variant } = result;

  // get final target directory
  const root = path.join(cwd, targetDir);

  if (overwrite === "yes") {
    emptyDir(root);
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  // determine template
  let template: string = variant || framework?.name || argTemplate;

  let isReactSwc = false;
  if (template.includes("-swc")) {
    isReactSwc = true;
    template = template.replace("-swc", "");
  }

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : "npm";
  const isYarn1 = pkgManager === "yarn" && pkgInfo?.version.startsWith("1.");

  const { customCommand } =
    FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template) ??
    {};


  if (customCommand) {
    const fullCustomCommand = customCommand
      .replace(/^npm create /, () => {
        // `bun create` uses it's own set of templates,
        // the closest alternative is using `bun x` directly on the package
        if (pkgManager === "bun") {
          return "bun x create-";
        }
        return `${pkgManager} create `;
      })
      // Only Yarn 1.x doesn't support `@version` in the `create` command
      .replace("@latest", () => (isYarn1 ? "" : "@latest"))
      .replace(/^npm exec/, () => {
        // Prefer `pnpm dlx`, `yarn dlx`, or `bun x`
        if (pkgManager === "pnpm") {
          return "pnpm dlx";
        }
        if (pkgManager === "yarn" && !isYarn1) {
          return "yarn dlx";
        }
        if (pkgManager === "bun") {
          return "bun x";
        }
        // Use `npm exec` in all other cases,
        // including Yarn 1.x and other custom npm clients.
        return "npm exec";
      });

    const [command, ...args] = fullCustomCommand.split(" ");
    // we replace TARGET_DIR here because targetDir may include a space
    const replacedArgs = args.map((arg) =>
      arg.replace("TARGET_DIR", targetDir)
    );
    const { status } = spawn.sync(command, replacedArgs, {
      stdio: "inherit",
    });
    process.exit(status ?? 0);
  }

  console.log(`\nScaffolding project in ${root}...`);

  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    "../..",
    `template-${template}`
  );


  const write = (file: string, content?: string) => {
    const targetPath = path.join(root, renameFiles[file] ?? file);
    if (content) {
      fs.writeFileSync(targetPath, content);
    } else {
      copy(path.join(templateDir, file), targetPath);
    }
  };

  const files = fs.readdirSync(templateDir);

  for (const file of files.filter((f) => f !== "package.json")) {
    write(file);
  }

  if (template != "vanilla-js") {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(templateDir, `package.json`), "utf-8")
    );
    pkg.name = packageName || getProjectName();
    write("package.json", JSON.stringify(pkg, null, 2) + "\n");
  }

  if (isReactSwc) {
    setupReactSwc(root, template.endsWith("-ts"));
  }

  const cdProjectName = path.relative(cwd, root);
  console.log(`\nDone. Now run:\n`);

  if (root !== cwd) {
    console.log(
      `  cd ${cdProjectName.includes(" ") ? `"${cdProjectName}"` : cdProjectName
      }`
    );
  }

  if (template != "vanilla-js") {
    switch (pkgManager) {
      case "yarn":
        console.log("  yarn");
        console.log("  yarn dev");
        break;
      default:
        console.log(`  ${pkgManager} install`);
        console.log(`  ${pkgManager} run dev`);
        break;
    }
  } else {
    console.log("  open index.html with browser");
  }

  console.log();
}

init().catch((e) => {
  console.error(e);
});
