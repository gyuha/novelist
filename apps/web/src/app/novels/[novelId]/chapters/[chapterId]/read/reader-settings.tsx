"use client";

import { useEffect, useRef, useState } from "react";

export type ReaderSettings = {
	font: "serif" | "sans";
	size: "base" | "large";
	width: "base" | "narrow";
};
export type ThemeChoice = "system" | "light" | "dark";

const SETTINGS_KEY = "novelist:reader-settings";
const THEME_KEY = "theme";
const DEFAULTS: ReaderSettings = { font: "serif", size: "base", width: "base" };

function load(): ReaderSettings {
	try {
		const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
		return {
			font: raw.font === "sans" ? "sans" : "serif",
			size: raw.size === "large" ? "large" : "base",
			width: raw.width === "narrow" ? "narrow" : "base",
		};
	} catch {
		return DEFAULTS;
	}
}

function loadTheme(): ThemeChoice {
	const stored = localStorage.getItem(THEME_KEY);
	return stored === "light" || stored === "dark" ? stored : "system";
}

function applyTheme(choice: ThemeChoice) {
	if (choice === "system") {
		delete document.documentElement.dataset.theme;
		localStorage.removeItem(THEME_KEY);
	} else {
		document.documentElement.dataset.theme = choice;
		localStorage.setItem(THEME_KEY, choice);
	}
}

/** Reading preferences live in this browser only. */
export function useReaderSettings() {
	const [settings, setSettings] = useState<ReaderSettings>(DEFAULTS);
	const [theme, setTheme] = useState<ThemeChoice>("system");

	useEffect(() => {
		setSettings(load());
		const stored = loadTheme();
		setTheme(stored);
		applyTheme(stored);
	}, []);

	function update(patch: Partial<ReaderSettings>) {
		const next = { ...settings, ...patch };
		setSettings(next);
		try {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
		} catch {
			// preferences just won't persist
		}
	}

	function changeTheme(choice: ThemeChoice) {
		setTheme(choice);
		applyTheme(choice);
	}

	return { settings, update, theme, changeTheme };
}

function Choice<T extends string>({
	legend,
	value,
	options,
	onChange,
	testId,
}: {
	legend: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	testId: string;
}) {
	return (
		<fieldset className="choice">
			<legend className="field-label">{legend}</legend>
			<div className="choice-row">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						className="btn"
						aria-pressed={value === option.value}
						onClick={() => onChange(option.value)}
						data-testid={`${testId}-${option.value}`}
					>
						{option.label}
					</button>
				))}
			</div>
		</fieldset>
	);
}

export function ReaderSettingsMenu({
	settings,
	update,
	theme,
	changeTheme,
}: ReturnType<typeof useReaderSettings>) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className="menu-root" ref={rootRef}>
			<button
				type="button"
				className="btn"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				data-testid="reader-settings-button"
			>
				읽기 설정
			</button>
			{open && (
				<div
					className="menu settings-menu"
					role="dialog"
					aria-label="읽기 설정"
					data-testid="reader-settings"
				>
					<Choice
						legend="글꼴"
						value={settings.font}
						onChange={(font) => update({ font })}
						options={[
							{ value: "sans", label: "고딕" },
							{ value: "serif", label: "명조" },
						]}
						testId="setting-font"
					/>
					<Choice
						legend="크기"
						value={settings.size}
						onChange={(size) => update({ size })}
						options={[
							{ value: "base", label: "기본" },
							{ value: "large", label: "크게" },
						]}
						testId="setting-size"
					/>
					<Choice
						legend="폭"
						value={settings.width}
						onChange={(width) => update({ width })}
						options={[
							{ value: "base", label: "기본" },
							{ value: "narrow", label: "좁게" },
						]}
						testId="setting-width"
					/>
					<Choice
						legend="테마"
						value={theme}
						onChange={changeTheme}
						options={[
							{ value: "system", label: "시스템" },
							{ value: "light", label: "밝게" },
							{ value: "dark", label: "어둡게" },
						]}
						testId="setting-theme"
					/>
				</div>
			)}
		</div>
	);
}
