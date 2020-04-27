/*!
 * This script generates the package structure for npm publishing and cleans up afterwards.
 * Its aim is to provide a neat import structure for consuming applications, e.g.
 * require("zwave-js/commandclasses") etc.
 */

import * as fs from "fs-extra";
import * as path from "path";

// Find this project's root dir
const projectRoot = path.join(__dirname, "..");
const packageJsonPath = path.join(projectRoot, "package.json");
const gitIgnorePath = path.join(projectRoot, ".gitignore");
// Define where the CC index file is located
const buildDir = path.join(projectRoot, "build");
// // Remember the files we copied (to delete later)
// const copiedFile = path.join(projectRoot, ".copied");
// Define which file extensions need to be in the package
const includeInPackageExtensions = [".js", ".d.ts", ".map"];

async function ignoreFiles(files: string[]): Promise<void> {
	let gitignore = await fs.readFile(gitIgnorePath, "utf8");
	let autoGeneratedStart = gitignore.indexOf("AUTO-GENERATED");
	autoGeneratedStart = gitignore.indexOf("\n", autoGeneratedStart) + 1;
	if (autoGeneratedStart === 0) autoGeneratedStart = gitignore.length;
	let autoGeneratedEnd = gitignore.slice(autoGeneratedStart).match(/^(#|$)/m)
		?.index;
	if (autoGeneratedEnd == undefined) autoGeneratedEnd = gitignore.length;
	else autoGeneratedEnd += autoGeneratedStart;

	gitignore = `${gitignore.slice(0, autoGeneratedStart)}${files
		.map((f) => "/" + f)
		.join("\n")}${files.length > 0 ? "\n" : ""}
${gitignore.slice(autoGeneratedEnd).replace(/^\n+/, "")}`;

	await fs.writeFile(gitIgnorePath, gitignore, "utf8");
}

export async function copyIndexFilesToRoot(): Promise<void> {
	// Move files to root dir
	const filesInBuildDir = (await fs.readdir(buildDir)).filter((file) =>
		file.includes("."),
	);
	if (!filesInBuildDir.length) {
		console.warn("No files in /build that need to be moved");
		return;
	}

	// await fs.writeJSON(copiedFile, filesInBuildDir);
	for (const file of filesInBuildDir) {
		const sourceFileName = path.join(buildDir, file);
		// Update relative paths
		let fileContents = await fs.readFile(sourceFileName, "utf8");
		fileContents = fileContents
			.replace(/"\.\/lib\//g, '"./build/lib/')
			.replace(/"\.\.\/src\//g, '"./src/')
			.replace(
				/__dirname/g,
				`require("path").join(__dirname, "./build")`,
			);
		const targetFileName = path.join(projectRoot, file);
		await fs.writeFile(targetFileName, fileContents, "utf8");
		await fs.unlink(sourceFileName);
	}
	// Make sure they are present in package.json -> files
	const packageJson = await fs.readJSON(packageJsonPath);
	let addedSomething = false;
	for (const file of filesInBuildDir) {
		if (
			(await fs.stat(file)).isFile() &&
			includeInPackageExtensions.some((ext) => file.endsWith(ext)) &&
			!packageJson.files.includes(file)
		) {
			packageJson.files.push(file);
			addedSomething = true;
		}
	}
	if (addedSomething) {
		packageJson.files.sort();
		await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
	}

	// Make sure the generated .js files are excluded in .gitignore
	await ignoreFiles(filesInBuildDir.filter((file) => file.endsWith(".js")));
}

export async function clean(): Promise<void> {
	// Delete build dir and all generated sources
	await fs.remove(buildDir);

	// Find all files that we copied to the root
	const packageJson = await fs.readJSON(packageJsonPath);
	const rootFiles: string[] = packageJson.files.filter((f: string) =>
		/(\.d)?(\.[jt]s)(\.map)?$/.test(f),
	);
	// if (!rootFiles.length) return;

	// delete them
	for (const file of rootFiles) {
		if (await fs.pathExists(file)) {
			await fs.unlink(file);
		}
	}
	// delete them from package.json -> files
	packageJson.files = packageJson.files.filter(
		(f: string) => !rootFiles.includes(f),
	);
	await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
	// and clean up the gitignore file
	await ignoreFiles([]);
}