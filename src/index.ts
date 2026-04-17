#!/usr/bin/env node

import { Command } from 'commander';
import { login } from './commands/login';
import { whoami } from './commands/whoami';
import { use } from './commands/use';
import { numbersList, numbersAdd } from './commands/numbers';
import { messagesList, messagesRead, messagesSend, messagesListen } from './commands/messages';
import { upgrade } from './commands/upgrade';

const program = new Command();

program
  .name('wassist')
  .description('Wassist CLI – manage your WhatsApp agents from the terminal')
  .version('0.1.0');

program
  .command('login')
  .description('Authenticate with your phone number')
  .action(login);

program
  .command('whoami')
  .description('Show the currently authenticated user')
  .action(whoami);

program
  .command('use <number>')
  .description('Set the active number for the current session')
  .action(use);

const numbers = program
  .command('numbers')
  .description('Manage your WhatsApp numbers');

numbers
  .command('list')
  .description('List your WhatsApp numbers')
  .action(numbersList);

numbers
  .command('add')
  .description('Add a new WhatsApp number')
  .action(numbersAdd);

const messages = program
  .command('messages')
  .description('View and send WhatsApp messages');

messages
  .command('list')
  .description('List conversations for the active number')
  .action(messagesList);

messages
  .command('read [phone-number]')
  .description('View messages for a contact (sandbox: no arg needed)')
  .option('--limit <n>', 'Number of messages to show', '20')
  .option('--page <n>', 'Page number (1-based)', '1')
  .action(messagesRead);

function collect(val: string, acc: string[]) {
  acc.push(val);
  return acc;
}

messages
  .command('send [to-number] [message]')
  .description('Send a message (sandbox: only message needed)')
  .option('--footer <text>', 'Footer text (max 60 chars)')
  .option('--media <url>', 'Media URL (image, video, audio, document)')
  .option('--url-button <label|url>', 'URL button (max 1, format: "Label|https://...")')
  .option('--reply <label|id>', 'Quick reply button (max 3, repeatable)', collect, [])
  .action(messagesSend);

messages
  .command('listen [phone-number]')
  .description('Stream inbound messages over a WebSocket (no polling)')
  .option('-i, --interactive', 'Allow replying to the conversation while listening')
  .action(messagesListen);

program
  .command('upgrade')
  .description('Upgrade your subscription plan')
  .action(upgrade);

program.parse();
