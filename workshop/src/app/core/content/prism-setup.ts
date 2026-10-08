// Side-effect module: registers Prism (global, as ngx-markdown expects) and the languages used by the tutorials.
// Order matters: `csharp` extends `clike`. `markup` (HTML/XML) ships with the Prism core.
import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-http';
