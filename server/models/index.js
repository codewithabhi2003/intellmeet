// Registers every model so cross-model helpers (e.g. cascade delete) can find them via mongoose.models.
['User', 'Workspace', 'Meeting', 'ChatMessage', 'Task', 'Recording', 'Transcript', 'TranscriptSegment', 'Translation', 'Summary'].forEach((m) => require(`./${m}`));
