import { watch } from 'fs';
import { spawn } from 'child_process';
import { fork, Sequence } from 'effection';
import { on } from '@effection/events';

function* start(): Sequence {
  let [ cmd, ...args ] = process.argv.slice(2);

  let listener = fork(function* changes() {
    let watcher = watch('src', { recursive: true });
    try {
      while (true) {
        yield on(watcher, "change");
        console.log('change detected, restarting....');
        restart();
      }
    } finally {
      watcher.close();
    }
  });

  let current = { halt: (x = undefined) => x };
  let restart = () => {
    current.halt();
    current = this.fork(function*() {
      try {
        yield launch(cmd, args);
        listener.halt();
      } catch (error) {
        console.log(error);
      }
    })
  };

  restart();
}

function* launch(cmd: string, args: string[]): Sequence {
  let child = spawn(cmd, args, { stdio: 'inherit'});

  fork(function*() {
    let errors = fork(function*() {
      let [ error ] = yield on(child, "error");
      throw error;
    });

    try {
      let [ code ] = yield on(child, 'exit');
      errors.halt();

      if (code > 0) {
        throw new Error(`exited with code ${code}`)
      }
    } finally {
      child.kill();
    }
  })


}

fork(function* main() {
  let interrupt = () => { console.log('');  this.halt()};
  process.on('SIGINT', interrupt);
  try {
    yield start;
  } catch (e) {
    console.log(e);
  } finally {
    process.off('SIGINT', interrupt);
  }
});
