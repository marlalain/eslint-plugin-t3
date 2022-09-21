import {ESLintUtils, TSESTree as t} from "@typescript-eslint/utils";
import * as path from "path";
import * as fs from "fs";
import {parse} from "@typescript-eslint/parser";
import {simpleTraverse} from "@typescript-eslint/typescript-estree";

const description = "Don't access process.env directly. Use typesafe environment variables";

const createRule = ESLintUtils.RuleCreator(name => "");

export default createRule({
	create(context) {
		// create(context: Readonly<TSESLint.RuleContext<"mainMessage", never[]>>) {
		return {
			MemberExpression(node: t.MemberExpression) {
				// process.env.${envName}

				const process = (node.object as t.MemberExpression)?.object as t.Identifier;
				if (process?.name !== "process") return;

				const env = (node.object as t.MemberExpression)?.property as t.Identifier;
				if (env?.name !== "env") return;

				const envName = (node.property as t.Identifier)?.name;
				if (!envName) return;

				let schema;
				if (!context.options[1]?.["schema-path"]) {
					const cwd = context.getCwd();
					schema = path.join(cwd, "src", "env", "schema.mjs")
					if (!fs.existsSync(schema)) context.report({
						node,
						messageId: "noSchema",
					});
				} else {
					schema = context.options[1]["schema-path"];
				}
				if (!schema) return;

				const code = fs.readFileSync(schema, "utf8");
				const ast = parse(code, {
					sourceType: "module",
					loc: false,
					range: false,
				})

				// Parsing a file like this below
				// https://github.com/minsk-dev/create-t3-app-template/blob/c953b197194df21d6a506729353ed1c1b5a67bc2/src/env/schema.mjs
				let envs: string[] = [];
				simpleTraverse(ast, {
					Property(node: t.Property) {
						const env = node?.key as t.Identifier;
						if (!env || !env?.name) return;

						const type = node?.value as t.CallExpression;
						if (!type || !type?.callee) return;

						const callee = type?.callee as t.MemberExpression
						if (!callee || !callee?.property) return;

						envs.push(env.name);
					}
				});

				const ignored = context.options[0]?.["ignore-environment-variables"] ?? [];
				if ([...ignored, ...envs].includes(envName)) return;

				context.report({
					node,
					messageId: "missing",
				});
			}
		}
	},
	name: "typesafe-env-vars",
	meta: {
		type: "suggestion",
		schema: [
			{
				title: "Ignore Variables",
				description: "Ignore variables that are not defined in the schema",
				required: false,
				properties: {
					"ignore-environment-variables": {
						type: "array",
					}
				}
			},
			{
				title: "Environment Variable Schema Path",
				description: "The path to the environment variable schema. Usually 'src/env/schema.mjs'",
				required: false,
				properties: {
					"schema-path": {
						type: "string"
					}
				}
			}],
		docs: {
			description,
			recommended: "error",
		},
		messages: {
			missing: description,
			noSchema: "Could not find schema.mjs. Please create one in src/env/schema.mjs or specify the path in the settings",
		},
	},
	defaultOptions: [],
});
