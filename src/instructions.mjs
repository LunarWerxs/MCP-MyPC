/** What the AI is told when it connects. */
export function instructions(config) {
  return [
    `MCP-MyPC lets you use this computer ("${config.name}") and, if it has joined a family, the family's other computers.`,
    'Every tool works on this computer unless you pass `computer` with a family computer name from list_computers.',
    'The people using this are family members, often not technical: explain what you are about to do in plain words,',
    'and ask before deleting files, uninstalling programs, changing settings or anything else hard to undo.',
  ].join(' ');
}
