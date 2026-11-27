# Pages, sections and the header

## Pages and rooms

There is a Home page and one page per room. In the editor, *Page settings* holds the page's name, icon, picture, the Home Assistant area it stands for, how many
columns it uses, and hiding or deleting the room. Rooms can also be added and reordered from the editor.

## Sections

A page is a list of **sections**, each with a name and an icon, holding devices, widgets, lights masters and scenes in the order you give them.

- *Add section* in the editor adds one. Rooms offer suggestions for what they could hold.
- *Reorder sections* moves them, and sets which column each sits in.
- A section's settings: name, icon, **width** (how many columns it spans on wide screens; it becomes one column on a phone), how its items are laid out
  (a list or a grid), hiding it, and **when it is shown**.

## Columns

A page can use one to four columns. Screens narrower than 760 px always show one; wider screens show as many as the page asks for and fit.

## When a section is shown

A section can have conditions, all of which must hold: a device's state, a sensor above or below a value, days of the week, a time window, daylight or dark,
sunrise time, someone or nobody home, or only for certain users. While editing you always see it.

## The header

In the editor, tap the header (or open its settings) to choose:

- the greeting, the line above the title and the clock;
- up to four **header items**: weather, who is home, how many lights are on, Attention, or any entity;
- **status tiles in the header**, per page: a row under the items with that page's readings (a temperature, an air quality value). A page can have six, one of them
  an *Attention* tile that appears only while something needs attention;
- a weather sky behind the header (each person can turn it off).

Header status tiles and a page's **Status section** are separate: the Status section is an ordinary section, to which sensors are added like any device and shown
as tiles.

## Attention

The *Attention* widget or tile lists what needs a look: low batteries, a robot vacuum in trouble, unavailable cameras, locks, air conditioners and lights. When
there is nothing, it hides itself, and a section left empty by that hides too. Which kinds count is set on the widget.

## What a condition can read

A condition can read any entity: its state or one of its attributes, as a word or as a number.
