import { describe, expect, it, vi } from 'vitest';
import { takeShortcut } from './genvagar';

const take = (search: string, hash = '') => {
	const history = { replaceState: vi.fn() };
	const action = takeShortcut({ pathname: '/', search, hash }, history);
	return { action, replaced: history.replaceState.mock.calls[0]?.[2] as string | undefined };
};

describe('takeShortcut', () => {
	it('reads the action and removes it from the address', () => {
		expect(take('?gor=starta')).toEqual({ action: 'starta', replaced: '/' });
		expect(take('?gor=stoppa', '#/vecka')).toEqual({ action: 'stoppa', replaced: '/#/vecka' });
	});

	it('keeps other parameters and leaves an address without an action alone', () => {
		expect(take('?a=1&gor=starta')).toEqual({ action: 'starta', replaced: '/?a=1' });
		expect(take('?a=1')).toEqual({ action: null, replaced: undefined });
		expect(take('')).toEqual({ action: null, replaced: undefined });
	});

	it('removes an unknown action without doing it', () => {
		expect(take('?gor=radera')).toEqual({ action: null, replaced: '/' });
	});
});
