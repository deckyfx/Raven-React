/**
 * Singleton class for typed environment configuration.
 */
class EnvConfig {
	private static instance: EnvConfig;

	private constructor() {
		// Private constructor prevents direct instantiation
	}

	/** Gets the singleton instance. */
	static getInstance(): EnvConfig {
		if (!EnvConfig.instance) {
			EnvConfig.instance = new EnvConfig();
		}
		return EnvConfig.instance;
	}

	/**
	 * An XML file to load the interface from, relative to the current directory,
	 * which reloads when saved. Unset: the interface embedded in the program.
	 */
	get UI_FILE(): string | undefined {
		return Bun.env.UI_FILE;
	}
}

export const envConfig = EnvConfig.getInstance();
