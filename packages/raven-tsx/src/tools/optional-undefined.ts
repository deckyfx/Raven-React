/**
 * Optional properties that also take `undefined` written out (`Name?: string | undefined`), as
 * `@types/react` writes its own. An application with `exactOptionalPropertyTypes` can then pass
 * a value that may be `undefined`, which the props already treat as absent. Used by the generator
 * on what it writes, and by a test on what is written by hand.
 */

import ts from "typescript";

/** An optional property, or optional properties of a mapped type, whose type does not name `undefined`. */
export interface MissingUndefined {
	/** Where its type starts and ends in the text. */
	readonly start: number;
	readonly end: number;
	/** The line, counted from 1, and the name of the property. */
	readonly line: number;
	readonly name: string;
	/** The type with `| undefined` added, in parentheses where it would change its meaning. */
	readonly replacement: string;
}

/** The optional property signatures of a TypeScript text that do not take `undefined`. */
export function missingUndefined(text: string, fileName = "props.ts"): MissingUndefined[] {
	const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
	const found: MissingUndefined[] = [];
	const visit = (node: ts.Node): void => {
		// (a property `Name?: T`, or each of a mapped type `{ [K in Names]?: T }`; not `-?`, which takes `?` away)
		const optional = ts.isPropertySignature(node)
			? node.questionToken !== undefined
			: ts.isMappedTypeNode(node) && node.questionToken !== undefined && node.questionToken.kind !== ts.SyntaxKind.MinusToken;
		if ((ts.isPropertySignature(node) || ts.isMappedTypeNode(node)) && optional && node.type) {
			const type = node.type;
			const members = ts.isUnionTypeNode(type) ? type.types : [type];
			if (!members.some((member) => member.kind === ts.SyntaxKind.UndefinedKeyword)) {
				const inner = type.getText(source);
				// (`() => void | undefined` would be a function that returns undefined)
				const wrap = ts.isFunctionTypeNode(type) || ts.isConstructorTypeNode(type) || ts.isConditionalTypeNode(type);
				found.push({
					start: type.getStart(source),
					end: type.getEnd(),
					line: source.getLineAndCharacterOfPosition(type.getStart(source)).line + 1,
					name: ts.isMappedTypeNode(node) ? `[${node.typeParameter.getText(source)}]` : node.name.getText(source),
					replacement: `${wrap ? `(${inner})` : inner} | undefined`,
				});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

/** The text with `| undefined` added to every optional property signature that lacks it. */
export function acceptUndefined(text: string, fileName = "props.ts"): string {
	let output = text;
	for (let missing = missingUndefined(output, fileName); missing.length > 0; missing = missingUndefined(output, fileName)) {
		// (an outer type holds its inner ones: those first, then a new reading for the outer ones)
		const innermost = missing.filter((outer) => !missing.some((inner) => inner !== outer && inner.start >= outer.start && inner.end <= outer.end));
		// (from the end, so that the positions before each change stay right)
		output = innermost
			.sort((a, b) => b.start - a.start)
			.reduce((changed, one) => changed.slice(0, one.start) + one.replacement + changed.slice(one.end), output);
	}
	return output;
}
