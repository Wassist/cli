#!/usr/bin/env node

import { Command } from 'commander';
import { login } from './commands/login';
import { whoami } from './commands/whoami';

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

program.parse();
