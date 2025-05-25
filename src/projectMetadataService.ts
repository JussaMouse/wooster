import fs from 'fs';
import path from 'path';
import * as Diff from 'diff';
import chalk from 'chalk';

// Placeholder for the actual project root determination logic
// This might come from a global config or be passed in.
const PROJECTS_BASE_DIR = path.join(process.cwd(), 'projects');

/**
 * Generates the default content for a new [projectName].md file.
 * @param projectName The name of the project.
 * @returns The default markdown content string.
 */
function getDefaultProjectMDContent(projectName: string): string {
  return `# Project: ${projectName}

## Project Overview
(A brief, high-level summary of the project. Wooster may attempt to populate this based on interactions, or the user can edit it directly.)

## Ingested Documents
(A list of documents, data sources, or URLs that have been ingested by Wooster for RAG and knowledge base purposes within this project.)

## Conversation Log & Key Decisions
(Chronological or summarized log of important user-Wooster interactions, questions, answers, and decisions made.)

## Wooster Actions
(A log of significant, non-trivial actions performed by Wooster within the project.)

## Tasks & TODOs
(A list of tasks or to-do items identified during conversations or by Wooster.)
`;
}

/**
 * Ensures that the [projectName].md file exists in the project's directory.
 * If it doesn't exist, it creates it with default content.
 * 
 * @param projectName The name of the project (e.g., "my-research").
 * @returns The absolute path to the [projectName].md file.
 * @throws Error if the project directory doesn't exist or if file operations fail.
 */
export function ensureProjectMDFile(projectName: string): string {
  const projectDir = path.join(PROJECTS_BASE_DIR, projectName);
  if (!fs.existsSync(projectDir)) {
    // Depending on desired behavior, we might create it or expect it to exist.
    // For now, let's assume the project directory should exist if we're managing its notes.
    // This aligns with how `create project` REPL command works.
    throw new Error(`Project directory not found: ${projectDir}. Please create the project first.`);
  }

  const mdFilePath = path.join(projectDir, `${projectName}.md`);

  if (!fs.existsSync(mdFilePath)) {
    try {
      const defaultContent = getDefaultProjectMDContent(projectName);
      fs.writeFileSync(mdFilePath, defaultContent, 'utf8');
      console.log(`Created project notes file: ${mdFilePath}`); // Or use logger
    } catch (error) {
      // Or use logger
      console.error(`Failed to create project notes file ${mdFilePath}:`, error);
      throw error; // Re-throw or handle more gracefully
    }
  }
  return mdFilePath;
}

/**
 * (Placeholder) Initializes the Project Metadata Service for a given project.
 * This might be called when a project is loaded or becomes active.
 */
export function initProjectMetadataService(projectName: string): void {
  console.log(`Initializing Project Metadata Service for project: ${projectName}`);
  try {
    ensureProjectMDFile(projectName);
  } catch (error) {
    console.error(`Error during Project Metadata Service initialization for ${projectName}:`, error);
    // Decide if this is a critical error that should halt further operations
  }
}

/**
 * Displays proposed changes between old and new content using a colored diff format.
 * 
 * @param fileName The name of the file being changed (for display purposes).
 * @param oldContent The original content string.
 * @param newContent The new content string.
 * @param contextLines The number of context lines to show around changes (default: 3).
 */
export function displayProposedChanges(
  fileName: string, 
  oldContent: string, 
  newContent: string, 
  contextLines: number = 3
): void {
  const patch = Diff.createPatch(fileName, oldContent, newContent, '', '', { context: contextLines });

  if (!patch.trim() || oldContent === newContent) {
    console.log(chalk.yellow(`No changes proposed for ${fileName}.`));
    return;
  }

  console.log(chalk.bold(`Proposed changes for ${fileName}:`));
  console.log(chalk.dim("--------------------------------------------------"));

  const lines = patch.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip the first two lines of the patch which are --- a/file and +++ b/file
    if (i < 2 && (line.startsWith('---') || line.startsWith('+++'))) {
      // console.log(chalk.dim(line)); // Optionally show them dimmed
      continue;
    }
    if (line.startsWith('@@')) {
      console.log(chalk.cyan(line)); // Hunk header
    } else if (line.startsWith('+')) {
      console.log(chalk.green(line)); // Added
    } else if (line.startsWith('-')) {
      console.log(chalk.red(line));  // Removed
    } else {
      // Ensure we don't print the "\ No newline at end of file" lines if they exist
      if (line !== '\\ No newline at end of file') {
        console.log(line); // Context or unchanged
      }
    }
  }
  console.log(chalk.dim("--------------------------------------------------"));
}

/**
 * Appends content to a specific section in the project's markdown file.
 * If the section doesn't exist, it logs an error but doesn't create it (for now).
 * 
 * @param projectName The name of the project.
 * @param sectionTitle The exact title of the section (e.g., "## Conversation Log & Key Decisions").
 * @param contentToAppend The string content to append under this section.
 */
export async function appendToSection(projectName: string, sectionTitle: string, contentToAppend: string): Promise<void> {
  try {
    const mdFilePath = ensureProjectMDFile(projectName); // Ensures file exists and gets path
    let fileContent = fs.readFileSync(mdFilePath, 'utf8');
    
    const sectionIndex = fileContent.indexOf(sectionTitle);
    if (sectionIndex === -1) {
      console.error(chalk.yellow(`Section "${sectionTitle}" not found in ${mdFilePath}. Content not appended.`));
      // Optionally, append to a default section or create the section if it's critical.
      // For now, we'll just log and skip.
      // As a fallback, append to the end of the file if section is not found.
      fileContent += `\\n${sectionTitle}\\n${contentToAppend}\\n`;
      // return; 
    }

    // Find the end of the section (next section or end of file)
    let nextSectionIndex = -1;
    const lines = fileContent.split('\\n');
    let inSection = false;
    let insertLineNum = lines.length; // Default to appending at the very end if section found but no clear end

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(sectionTitle)) {
        inSection = true;
        // Start looking for the next section from the line after the current sectionTitle
        continue;
      }
      if (inSection && (lines[i].startsWith('## ') || lines[i].startsWith('# '))) {
        nextSectionIndex = i;
        insertLineNum = i; // Insert before the next section header
        break;
      }
    }
    
    if (sectionIndex !== -1) { // Section was found
        if (nextSectionIndex !== -1) {
            // Insert before the next section
            lines.splice(insertLineNum, 0, contentToAppend);
        } else {
            // Section is the last one, append to the end of it (or file if it was empty)
            if (sectionIndex + sectionTitle.length >= fileContent.length) { // section title is at EOF
                 lines.push(contentToAppend);
            } else {
                 // Find where the section content ends and append there.
                 // This basic logic just appends after the section title line if no other section follows.
                 // A more robust way would be to find the line number of sectionTitle and append after it.
                 let titleLineIndex = -1;
                 for(let i=0; i<lines.length; i++) {
                    if (lines[i].startsWith(sectionTitle)) {
                        titleLineIndex = i;
                        break;
                    }
                 }
                 if (titleLineIndex !== -1) {
                    // Append after the title, ensuring it's on a new line.
                    // If there's existing content, find where it ends.
                    // For simplicity now, just add after title or at end of section
                    let endOfSectionIndex = lines.length;
                    for (let i = titleLineIndex + 1; i < lines.length; i++) {
                        if (lines[i].startsWith('## ') || lines[i].startsWith('# ')) {
                            endOfSectionIndex = i;
                            break;
                        }
                    }
                    lines.splice(endOfSectionIndex, 0, contentToAppend);

                 } else { // Should not happen if sectionIndex was valid
                    lines.push(contentToAppend);
                 }
            }
        }
        fileContent = lines.join('\\n');
    }
    // If sectionIndex was -1 (section not found), fileContent already includes the new section and content at the end.

    fs.writeFileSync(mdFilePath, fileContent, 'utf8');
    // console.log(chalk.blueBright(`Appended to "${sectionTitle}" in ${mdFilePath}`));
  } catch (error) {
    console.error(chalk.red(`Failed to append to section "${sectionTitle}" in project "${projectName}":`), error);
  }
}

/**
 * Logs a conversation turn (user input and Wooster response) to the project's markdown file.
 * @param projectName The name of the project.
 * @param userInput The user's input string.
 * @param woosterResponse The Wooster's response string.
 */
export async function logConversationTurn(projectName: string, userInput: string, woosterResponse: string): Promise<void> {
  const sectionTitle = "## Conversation Log & Key Decisions";
  const timestamp = new Date().toISOString();
  
  const truncatedInput = userInput.length > 200 ? userInput.substring(0, 200) + '...' : userInput;
  const truncatedResponse = woosterResponse.length > 200 ? woosterResponse.substring(0, 200) + '...' : woosterResponse;

  const formattedContent = `
**Timestamp:** ${timestamp}
**User:** ${truncatedInput}
**Wooster:** ${truncatedResponse}
---`;
  await appendToSection(projectName, sectionTitle, formattedContent);
}

/**
 * Logs a Wooster action (tool execution) to the project's markdown file.
 * @param projectName The name of the project.
 * @param toolName The name of the tool executed.
 * @param toolInput The input provided to the tool (can be an object, stringify appropriately).
 * @param toolResult The result/output from the tool.
 */
export async function logWoosterAction(projectName: string, toolName: string, toolInput: any, toolResult: string): Promise<void> {
  const sectionTitle = "## Wooster Actions";
  const timestamp = new Date().toISOString();
  let formattedInput = toolInput;
  if (typeof toolInput === 'object') {
    try {
      formattedInput = JSON.stringify(toolInput, null, 2);
    } catch (e) {
      formattedInput = String(toolInput);
    }
  }
  const formattedContent = `
**Timestamp:** ${timestamp}
**Action:** Tool Execution
**Tool:** \`${toolName}\`
**Input:** 
\`\`\`json
${formattedInput}
\`\`\`
**Result:** 
\`\`\`
${toolResult}
\`\`\`
---`;
  await appendToSection(projectName, sectionTitle, formattedContent);
}

// Future functions to be added:
// - appendToSection(filePath: string, sectionTitle: string, content: string): Promise<void>
// - rewriteSection(filePath: string, sectionTitle: string, newContent: string): Promise<void>
// - logIngestedDocument(projectName: string, docName: string, docPath?: string): Promise<void>
// - getProjectNotesContent(projectName: string): Promise<string>
// - updateProjectNotesWithLLM(projectName: string): Promise<void> // This will use the diff display

console.log('Project Metadata Service module loaded.'); // For dev purposes 