// Trivial example skill: returns the input string unchanged.
// Use this as a template for writing your own skills.

export const name = 'echo';

export const description = 'Returns the input string unchanged. Useful for testing.';

export const input_schema = {
  type: 'object',
  properties: {
    message: { type: 'string', description: 'The string to echo back.' },
  },
  required: ['message'],
};

export function run({ message }) {
  return message;
}
