import { isObject, RpcError } from './rpc.mjs';

const string = description => ({ type: 'string', description });
const number = description => ({ type: 'number', description });
const app = string('Application name, full path, or unambiguous bundle identifier. Use the same target throughout a session.');
const element_index = string('Element identifier from the most recent get_app_state result.');
const definitions = [
  ['list_apps', 'List running and recently used applications.', {}, []],
  ['get_app_state', 'Read the key window, accessibility tree and screenshot. Establishes an app session; the runtime may activate the app.', { app }, ['app']],
  ['click', 'Click a current element or screenshot pixel coordinates.', { app, element_index, x: number('Screenshot X'), y: number('Screenshot Y'), click_count: { type: 'integer', minimum: 1, maximum: 3 }, mouse_button: { type: 'string', enum: ['left', 'right', 'middle'] } }, ['app']],
  ['perform_secondary_action', 'Invoke a named accessibility action shown in the current state.', { app, element_index, action: string('Accessibility action name') }, ['app', 'element_index', 'action']],
  ['set_value', 'Assign a value to a settable accessibility element.', { app, element_index, value: string('Value to assign') }, ['app', 'element_index', 'value']],
  ['select_text', 'Select text, or place the cursor before or after an exact text match.', { app, element_index, text: string('Exact text'), prefix: string('Preceding context'), suffix: string('Following context'), selection: { type: 'string', enum: ['text', 'cursor_before', 'cursor_after'] } }, ['app', 'element_index', 'text']],
  ['scroll', 'Scroll the specified accessibility element.', { app, element_index, direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] }, pages: { type: 'number', exclusiveMinimum: 0 } }, ['app', 'element_index', 'direction']],
  ['drag', 'Drag between two screenshot pixel coordinates.', { app, from_x: number('Start X'), from_y: number('Start Y'), to_x: number('End X'), to_y: number('End Y') }, ['app', 'from_x', 'from_y', 'to_x', 'to_y']],
  ['press_key', 'Press a key or combination such as Return, super+c, or Up.', { app, key: string('Key combination') }, ['app', 'key']],
  ['type_text', 'Type literal text in the current application.', { app, text: string('Literal text') }, ['app', 'text']],
  ['computer_use_status', 'Check component signatures and local configuration. Does not prove GUI access.', {}, []]
];
export const TOOLS = definitions.map(([name, description, properties, required]) => ({
  name, description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  annotations: {
    readOnlyHint: ['list_apps', 'computer_use_status'].includes(name),
    destructiveHint: !['list_apps', 'get_app_state', 'computer_use_status'].includes(name),
    idempotentHint: ['list_apps', 'get_app_state', 'computer_use_status'].includes(name),
    openWorldHint: true
  }
}));
export const METHODS = new Set(TOOLS.filter(t => t.name !== 'computer_use_status').map(t => t.name));
export const isAction = name => METHODS.has(name) && !['get_app_state', 'list_apps'].includes(name);

export function validateArguments(name, args = {}) {
  const schema = TOOLS.find(t => t.name === name)?.inputSchema;
  if (!schema) throw new RpcError(-32602, `Unknown tool: ${name}`);
  if (!isObject(args)) throw new RpcError(-32602, 'Arguments must be an object');
  if (Buffer.byteLength(JSON.stringify(args)) > 1024 * 1024) throw new RpcError(-32602, 'Arguments exceed 1 MiB');
  for (const key of schema.required) if (!Object.hasOwn(args, key)) throw new RpcError(-32602, `Missing argument: ${key}`);
  for (const [key, value] of Object.entries(args)) {
    const prop = schema.properties[key];
    if (!prop) throw new RpcError(-32602, `Unsupported argument: ${key}`);
    const validType = prop.type === 'integer' ? Number.isSafeInteger(value) : typeof value === prop.type;
    if (!validType || (typeof value === 'number' && !Number.isFinite(value))) throw new RpcError(-32602, `Invalid type for ${key}`);
    if (prop.enum && !prop.enum.includes(value)) throw new RpcError(-32602, `Invalid value for ${key}`);
    if (prop.minimum !== undefined && value < prop.minimum) throw new RpcError(-32602, `${key} is below its minimum`);
    if (prop.exclusiveMinimum !== undefined && value <= prop.exclusiveMinimum) throw new RpcError(-32602, `${key} must be positive`);
    if (prop.maximum !== undefined && value > prop.maximum) throw new RpcError(-32602, `${key} exceeds its maximum`);
  }
  if ('app' in args && !args.app.trim()) throw new RpcError(-32602, 'app must not be empty');
  if (name === 'click' && !(typeof args.element_index === 'string' || (typeof args.x === 'number' && typeof args.y === 'number'))) throw new RpcError(-32602, 'click needs element_index or both x and y');
  if (name === 'click' && (('x' in args) !== ('y' in args))) throw new RpcError(-32602, 'x and y must be provided together');
  return args;
}
