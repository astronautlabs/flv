import 'reflect-metadata';
import 'zone.js';
import { suite } from 'razmin';

suite().include(['./**/*.test.js']).run();