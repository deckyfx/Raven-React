import * as r from "./raven";

/** An error of the renderer or of Raven under it. */
export class RavenError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RavenError";
	}

	/** Throws an error with this message. */
	static throw(message: string): never {
		throw new RavenError(message);
	}

	/** Throws with the message of the last error of the library added. */
	static fromLibrary(context: string): never {
		const [code, detail] = r.Rerror_get_last();
		throw new RavenError(`${context}: ${r.Rerror_to_string(code)}: ${detail}`);
	}
}
