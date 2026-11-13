// The tests of Solid are compiled for Solid; those of React stay as Bun compiles them.
import { plugin } from "bun";
import { solidPlugin } from "../../solid/plugin";

plugin(solidPlugin({ filter: /[\\/]test[\\/]solid[\\/].*\.tsx$/ }));
