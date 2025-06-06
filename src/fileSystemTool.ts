import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import { log, LogLevel } from './logger'; // Adjusted path

function getCurrentProjectPath(currentProjectName: string): string {
  if (!currentProjectName) {
    throw new Error("No project is currently loaded. Cannot determine project path.");
  }
  return path.resolve(process.cwd(), 'projects', currentProjectName);
}

const CreateFileSchema = z.object({
  relativeFilePath: z.string().min(1, "File path cannot be empty."),
  content: z.string(), // Allow empty content, e.g., for touch-like behavior or if content is added later
  currentProjectName: z.string().min(1, "Project name cannot be empty."),
});

// This interface defines the structure of the arguments for the _call method
interface CreateFileArgs {
  relativeFilePath: string;
  content: string;
  currentProjectName: string;
}

// Define a class that extends StructuredTool
class CreateFileToolClass extends StructuredTool {
  name = "create_file";
  description = "Creates a new file with specified content within a given project's directory. " +
                "Used for saving notes, data, code snippets, or any textual information. " +
                "You MUST provide 'relativeFilePath', 'content', and 'currentProjectName'.";
  schema = CreateFileSchema;

  constructor() {
    super(); // Call the constructor of the base class
  }

  protected async _call(args: CreateFileArgs): Promise<string> {
    log(LogLevel.DEBUG, '[Tool:create_file] Parsed args received by _call:', { args });
    const { relativeFilePath, content, currentProjectName } = args;
    // Adjust if tool is asked to write to 'journal.md' directly: redirect to the project's main journal file
    let effectiveRelativeFilePath = relativeFilePath;
    const parsedPath = path.parse(relativeFilePath);
    if (parsedPath.base.toLowerCase() === 'journal.md') {
      effectiveRelativeFilePath = path.join(parsedPath.dir, `${currentProjectName}.md`);
      log(LogLevel.INFO, `[Tool:create_file] Redirecting 'journal.md' to project journal file: '${effectiveRelativeFilePath}'.`);
    }

    const projectPath = getCurrentProjectPath(currentProjectName);
    const absoluteFilePath = path.resolve(projectPath, effectiveRelativeFilePath);

    if (!absoluteFilePath.startsWith(projectPath + path.sep) && absoluteFilePath !== projectPath) {
      if (absoluteFilePath === projectPath && relativeFilePath === '') {
        return `Error: Empty file path is not allowed. Please provide a valid relative file path.`;
      }
      log(LogLevel.WARN, `Security: Attempt to write file outside of project directory blocked. Path: ${absoluteFilePath}, Project: ${projectPath}`);
      return `Error: File path is outside the project directory. Blocked for security reasons. Please use a relative path within the project: ${effectiveRelativeFilePath}`;
    }
    
    if (effectiveRelativeFilePath.trim() === '.' || effectiveRelativeFilePath.includes('..')) {
      return `Error: Invalid relative file path provided: "${effectiveRelativeFilePath}". Path must not point to current or parent directories using '.' or '..'.`;
    }

    try {
      const dirName = path.dirname(absoluteFilePath);
      if (!fs.existsSync(dirName)) {
          fs.mkdirSync(dirName, { recursive: true });
      }

      await fs.promises.writeFile(absoluteFilePath, content, 'utf8');
      log(LogLevel.INFO, `File created successfully by agent: ${absoluteFilePath} in project ${currentProjectName}`);
      return `File '${effectiveRelativeFilePath}' created successfully in project '${currentProjectName}'.`;
    } catch (error: any) {
      log(LogLevel.ERROR, `Error creating file '${absoluteFilePath}' in project '${currentProjectName}':`, { errorMessage: error.message, error });
      return `Error creating file '${effectiveRelativeFilePath}': ${error.message}`;
    }
  }
}

// Instantiate the class
export const createFileTool = new CreateFileToolClass(); 

// New ReadFileTool
const ReadFileSchema = z.object({
  relativeFilePath: z.string().min(1, "File path cannot be empty."),
  currentProjectName: z.string().min(1, "Project name cannot be empty."),
});

interface ReadFileArgs {
  relativeFilePath: string;
  currentProjectName: string;
}

class ReadFileToolClass extends StructuredTool {
  name = "read_file_content";
  description = "Reads and returns the entire content of a specified file within a given project's directory. " +
                "Use this to get the text from a file for viewing or before modifying it. " +
                "You MUST provide 'relativeFilePath' and 'currentProjectName'.";
  schema = ReadFileSchema;

  constructor() {
    super();
  }

  protected async _call(args: ReadFileArgs): Promise<string> {
    log(LogLevel.DEBUG, '[Tool:read_file_content] Parsed args received by _call:', { args });
    const { relativeFilePath, currentProjectName } = args;

    const projectPath = getCurrentProjectPath(currentProjectName); // Assuming getCurrentProjectPath is in scope
    const absoluteFilePath = path.resolve(projectPath, relativeFilePath);

    if (!absoluteFilePath.startsWith(projectPath + path.sep) && absoluteFilePath !== projectPath) {
      log(LogLevel.WARN, `Security: Attempt to read file outside of project directory blocked. Path: ${absoluteFilePath}, Project: ${projectPath}`);
      return `Error: File path is outside the project directory. Blocked for security reasons. Please use a relative path within the project: ${relativeFilePath}`;
    }

    if (relativeFilePath.trim() === '.' || relativeFilePath.includes('..')) {
      return `Error: Invalid relative file path provided: "${relativeFilePath}". Path must not point to current or parent directories using '.' or '..'.`;
    }

    try {
      if (!fs.existsSync(absoluteFilePath)) {
        return `Error: File not found at '${relativeFilePath}' in project '${currentProjectName}'.`;
      }
      if (fs.statSync(absoluteFilePath).isDirectory()) {
        return `Error: Path '${relativeFilePath}' in project '${currentProjectName}' is a directory, not a file. Cannot read content.`;
      }
      const content = await fs.promises.readFile(absoluteFilePath, 'utf8');
      log(LogLevel.INFO, `File content read successfully by agent: ${absoluteFilePath} in project ${currentProjectName}`);
      return content;
    } catch (error: any) {
      log(LogLevel.ERROR, `Error reading file '${absoluteFilePath}' in project '${currentProjectName}':`, { errorMessage: error.message, error });
      return `Error reading file '${relativeFilePath}': ${error.message}`;
    }
  }
}

export const readFileTool = new ReadFileToolClass(); 