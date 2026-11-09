const COLOR = { idle: 'bg-muted', recording: 'bg-danger', processing: 'bg-accent', completed: 'bg-success', error: 'bg-danger' } as const;
const LABEL = { idle: 'Idle', recording: 'Recording', processing: 'Processing', completed: 'Completed', error: 'Error' } as const;

export function RecordingIndicator({ state }: { state: keyof typeof COLOR }) {
  return (
    <span role="img" aria-label={LABEL[state]}
      className={`inline-block size-2.5 rounded-full ${COLOR[state]} ${state === 'recording' ? 'mw-pulse' : ''}`} />
  );
}
