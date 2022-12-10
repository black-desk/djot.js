/* Parser for attributes
attributes { id = "foo", class = "bar baz",
             key1 = "val1", key2 = "val2" }
syntax:

attributes <- '{' whitespace* attribute (whitespace attribute)* whitespace* '}'
attribute <- identifier | class | keyval
identifier <- '#' name
class <- '.' name
name <- (nonspace, nonpunctuation other than ':', '_', '-')+
keyval <- key '=' val
key <- (ASCII_ALPHANUM | ':' | '_' | '-')+
val <- bareval | quotedval
bareval <- (ASCII_ALPHANUM | ':' | '_' | '-')+
quotedval <- '"' ([^"] | '\"') '"'
*/

// states
enum State {
  SCANNING = 0,
  SCANNING_ID,
  SCANNING_CLASS,
  SCANNING_KEY,
  SCANNING_VALUE,
  SCANNING_BARE_VALUE,
  SCANNING_QUOTED_VALUE,
  SCANNING_ESCAPED,
  SCANNING_COMMENT,
  FAIL,
  DONE,
  START
}

type Match = {
  startpos : number,
  endpos : number,
  annotation : string
}

const isKeyChar = function(c : string) {
  return (/^[a-zA-Z0-9_:-]/.exec(c) !== null);
}

const handlers : ((parser : AttributeParser, pos : number) => State)[] = [];

handlers[State.START] = function(parser : AttributeParser, pos : number) {
  if (parser.subject.charAt(pos) === '{') {
    return State.SCANNING;
  } else {
    return State.FAIL;
  }
}

handlers[State.FAIL] = function(parser : AttributeParser, pos : number) {
  return State.FAIL;
}

handlers[State.DONE] = function(parser : AttributeParser, pos : number) {
  return State.DONE;
}

handlers[State.SCANNING] = function(parser : AttributeParser, pos : number) {
  const c = parser.subject.charAt(pos);
  if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
    return State.SCANNING;
  } else if (c === '}') {
    return State.DONE;
  } else if (c === '#') {
    parser.begin = pos;
    return State.SCANNING_ID;
  } else if (c === '%') {
    parser.begin = pos;
    return State.SCANNING_COMMENT;
  } else if (c === '.') {
    parser.begin = pos;
    return State.SCANNING_CLASS;
  } else if (isKeyChar(c)) {
    parser.begin = pos;
    return State.SCANNING_KEY;
  } else {
    return State.FAIL;
  }
}

handlers[State.SCANNING_COMMENT] = function(parser : AttributeParser, pos : number) {
  if (parser.subject.charAt(pos) === '%') {
    return State.SCANNING;
  } else {
    return State.SCANNING_COMMENT;
  }
}

handlers[State.SCANNING_ID] = function(parser : AttributeParser, pos : number) {
  const c = parser.subject.substr(pos, 1);

  if ((/^[^\s\p]/.exec(c) !== null) || c === '_' || c === '-' || c === ':') {
    return State.SCANNING_ID;
  } else if (c === '}') {
    if (parser.begin && parser.lastpos && parser.lastpos > parser.begin) {
      parser.addMatch(parser.begin + 1, parser.lastpos, "id");
    }
    parser.begin = null;
    return State.DONE;
  } else if (/^\s/.exec(c) !== null) {
    if (parser.begin && parser.lastpos && parser.lastpos > parser.begin) {
      parser.addMatch(parser.begin + 1, parser.lastpos, "id");
    }
    parser.begin = null;
    return State.SCANNING;
  } else {
    return State.FAIL;
  }
}

handlers[State.SCANNING_CLASS] = function(parser : AttributeParser, pos : number) {
  const c = parser.subject.substr(pos, 1);
  if ((/^[^\s\p]/.exec(c) !== null) || c === '_' || c === '-' || c === ':') {
    return State.SCANNING_CLASS;
  } else if (c === '}') {
    if (parser.begin && parser.lastpos && parser.lastpos > parser.begin) {
      parser.addMatch(parser.begin + 1, parser.lastpos, "class");
    }
    parser.begin = null;
    return State.DONE;
  } else if (/^\s/.exec(c) !== null) {
    if (parser.begin && parser.lastpos && parser.lastpos > parser.begin) {
      parser.addMatch(parser.begin + 1, parser.lastpos, "class");
    }
    parser.begin = null;
    return State.SCANNING;
  } else {
    return State.FAIL;
  }
}

handlers[State.SCANNING_KEY] = function(parser : AttributeParser, pos : number) {
  const c = parser.subject.substr(pos, 1);
  if (c === '=' && parser.begin && parser.lastpos) {
    parser.addMatch(parser.begin, parser.lastpos, "key");
    parser.begin = null;
    return State.SCANNING_VALUE;
  } else if (/^[a-zA-Z0-9_:-]/.exec(c) !== null) {
    return State.SCANNING_KEY;
  } else {
    return State.FAIL;
  }
}

handlers[State.SCANNING_VALUE] = function(parser : AttributeParser, pos : number) {
  const c = parser.subject.charAt(pos);
  if (c === '"') {
    parser.begin = pos;
    return State.SCANNING_QUOTED_VALUE;
  } else if (/^[a-zA-Z0-9_:-]/.exec(c) !== null) {
    parser.begin = pos;
    return State.SCANNING_BARE_VALUE;
  } else {
    return State.FAIL;
  }
}

handlers[State.SCANNING_BARE_VALUE] = function(parser : AttributeParser, pos : number) {
  const c = parser.subject.charAt(pos);
  if (/^[a-zA-Z0-9_:-]/.exec(c) !== null) {
    return State.SCANNING_BARE_VALUE;
  } else if (c === '}' && parser.begin && parser.lastpos) {
    parser.addMatch(parser.begin, parser.lastpos, "value");
    parser.begin = null;
    return State.DONE;
  } else if (/^\s/.exec(c) && parser.begin && parser.lastpos) {
    parser.addMatch(parser.begin, parser.lastpos, "value");
    parser.begin = null;
    return State.SCANNING;
  } else {
    return State.FAIL;
  }
}

handlers[State.SCANNING_ESCAPED] = function(parser : AttributeParser, pos : number) {
  return State.SCANNING_QUOTED_VALUE;
}

handlers[State.SCANNING_QUOTED_VALUE] = function(parser : AttributeParser, pos : number) {
  const c = parser.subject.charAt(pos);
  if (c === '"' && parser.begin && parser.lastpos) {
    parser.addMatch(parser.begin + 1, parser.lastpos, "value");
    parser.begin = null;
    return State.SCANNING;
  } else if (c === "\\") {
    return State.SCANNING_ESCAPED;
  } else {
    return State.SCANNING_QUOTED_VALUE;
  }
}

class AttributeParser {
  subject : string;
  state : State;
  begin : number | null;
  lastpos : number | null;
  matches : Match[];

  constructor(subject : string) {
    this.subject = subject;
    this.state = State.START;
    this.begin = null;
    this.lastpos = null;
    this.matches = []
  }

  addMatch(startpos : number, endpos : number, annot : string) {
    this.matches.push({ startpos: startpos, endpos: endpos, annotation: annot });
  }

  /* Feed parser a slice of text from the subject, between
   * startpos and endpos inclusive.  Return object with
   * status and position,
   * where status is either "done" (position should point to
   * final '}'), "fail" (position should point to first character
   * that could not be parsed), or "continue" (position should
   * point to last character parsed). */
  feed(startpos : number, endpos : number) {
    var pos = startpos;
    while (pos <= endpos) {
      this.state = handlers[this.state](this, pos);
      if (this.state === State.DONE) {
        return {status: "done", position: pos};
      } else if (this.state === State.FAIL) {
        this.lastpos = pos;
        return {status: "fail", position: pos};
      } else {
        this.lastpos = pos;
        pos = pos + 1;
      }
    }
    return {status: "continue", position: endpos};
  }
}

const test = function() {
  const x = `{a=b #ident
.class
key=val1
.class key2="val two \\" ok"}abc`;
  const parser = new AttributeParser(x);
  const result = parser.feed(0,x.length - 1);
  console.log(result.status, result.position);
  console.log(parser.matches);
}

test()

export {
  AttributeParser
}
