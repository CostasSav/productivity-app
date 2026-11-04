import { emitKeypressEvents, type Key } from 'node:readline';

// Interactive only: secrets never enter command history, process arguments, env vars or files.
// Refusing a non-TTY stdin also rules out piping or redirecting a file into the script.
export async function hiddenInput(prompt: string, maxLength = 1024): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Use an interactive terminal');
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onKey = (text: string, key: Key) => {
      if (key.ctrl && key.name === 'c') { finish(); reject(new Error('Cancelled')); }
      else if (key.name === 'return') { finish(); resolve(value); }
      else if (key.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text) && value.length < maxLength) value += text;
    };
    process.stdin.on('keypress', onKey);
  });
}
