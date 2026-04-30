# Skills

A skill is a plain JavaScript file that extends the agent with a custom tool.

## How to write a skill

Create a `.js` file in this directory that uses ES module syntax and exports these four fields:

```js
// skills/my-skill.js

export const name = 'my_skill';

export const description = 'A short description of what this skill does.';

export const input_schema = {
  type: 'object',
  properties: {
    message: { type: 'string', description: 'Input to the skill.' },
  },
  required: ['message'],
};

export async function run({ message }) {
  // Do something useful and return a string
  return `You said: ${message}`;
}
```

The agent loads all `.js` files from the skills directory at startup and registers them as tools. The Anthropic model can call any registered tool by name.

## Rules

- **No runtime dependencies.** Skills follow the same zero-dep rule as the rest of rawclaw. Use only `node:*` standard library modules.
- **Return a string.** The `run` function should return a string (or a value that serialises to a useful string). This is sent back to the model as the tool result.
- **Handle errors.** If your skill throws, the agent will catch it and report the error to the model as the tool result.
- **Review before installing.** Skills are arbitrary code. Only install skills you have read and trust.

## Example

See [`echo.js`](./echo.js) for the simplest possible skill.
