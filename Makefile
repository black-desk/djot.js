VERSION=$(shell grep '\"version\":' package.json | sed -e 's/.*: \"\([^"]*\)".*/\1/')

test: build
	npm test --noStackTrace
.PHONY: test

build:
	tsc
.PHONY: build

bench:
	npm run bench
.PHONY: bench

dist/djot.js:
	npm run build

playground/djot.js: dist/djot.js
	cp $< playground/djot.js

pm.dj:
	curl https://raw.githubusercontent.com/jgm/pandoc/master/MANUAL.txt \
		| pandoc -t json | ./djot -f pandoc -t djot > $@

check-optimization: pm.dj
	node --trace_opt --trace_deopt --allow-natives-syntax ./lib/cli.js \
		pm.dj | grep deopt | awk '{ print $$0 "\n"; }'
.PHONY: check-optimization

update-playground: playground/djot.js
	rsync -a --delete playground website:djot.net/
.PHONY: update-playground

doc/djot.1: doc/djot.md
	pandoc \
	  --metadata title="DJOT(1)" \
	  --metadata author="" \
	  --variable footer="djot $(VERSION)" \
	  $< -s -o $@

djot-schema.json: src/ast.ts
	# npm install -g typescript-json-schema
	typescript-json-schema --required --noExtraProps $< Doc -o $@

clean:
	rm -rf dist
.PHONY: clean
